import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cached } from './cache.mjs';
import { config } from './config.mjs';
import {
  checkQualities,
  createJobDir,
  downloadAndPrepare,
  probeSource,
  removeJobDir,
} from './download.mjs';
import { HttpError, toPublicError } from './errors.mjs';
import { fetchAlbum, fetchLyrics, resolveAudio, searchTracks } from './upstream.mjs';
import {
  albumSchema,
  checkSchema,
  downloadSchema,
  lyricsSchema,
  parseBody,
  probeSchema,
  resolveSchema,
  searchSchema,
} from './validation.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = packageJson.version ?? '2.0.1';
const distDir = path.join(here, '..', 'dist');
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

app.use(
  helmet({
    contentSecurityPolicy:
      config.env === 'production'
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
              imgSrc: ["'self'", 'data:', 'https:', 'http:'],
              mediaSrc: ["'self'", 'https:', 'http:', 'blob:'],
              connectSrc: ["'self'", 'https:'],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              frameAncestors: ["'self'", 'https:'],
            },
          }
        : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(compression());
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
  next();
});

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.limits.apiPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Demasiadas solicitudes seguidas. Espera un minuto y vuelve a intentarlo.',
    },
  },
});

const downloadLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.limits.downloadPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Has preparado demasiadas descargas. Espera un minuto antes de continuar.',
    },
  },
});

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const api = express.Router();
api.use(apiLimiter);

api.get('/config', (_req, res) => {
  res.json({
    data: {
      version,
      catalogs: [
        { value: 'kuwo', name: 'Kuwo', initial: 'K' },
        { value: 'wyy', name: 'NetEase', initial: 'W' },
      ],
      pageSize: 20,
      maxKeywordLength: 120,
      maxDownloadBytes: config.maxDownloadBytes,
    },
  });
});

api.get('/health', (_req, res) => {
  res.json({
    data: {
      status: 'ok',
      version,
      pid: process.pid,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      upstream: config.upstreamApi,
    },
  });
});

api.post(
  '/search',
  asyncRoute(async (req, res) => {
    const input = parseBody(searchSchema, req.body);
    const key = `search:${input.platform}:${input.page}:${input.keyword.toLowerCase()}`;
    const data = await cached(key, config.cache.searchMs, () => searchTracks(input));
    res.json({ data });
  }),
);

api.post(
  '/resolve',
  asyncRoute(async (req, res) => {
    const input = parseBody(resolveSchema, req.body);
    const key = `resolve:${input.platform}:${input.songid}:${input.format}:${input.bitrate}:${input.time ?? ''}:${input.sign ?? ''}`;
    const data = await cached(key, config.cache.resolveMs, () => resolveAudio(input));
    res.json({ data });
  }),
);

api.post(
  '/lyrics',
  asyncRoute(async (req, res) => {
    const input = parseBody(lyricsSchema, req.body);
    const key = `lyrics:${input.platform}:${input.songid}`;
    const data = await cached(key, config.cache.lyricsMs, () => fetchLyrics(input));
    res.json({ data });
  }),
);

api.post(
  '/album',
  asyncRoute(async (req, res) => {
    const input = parseBody(albumSchema, req.body);
    const key = `album:${input.platform}:${input.id}:${input.page}:${input.size}`;
    const data = await cached(key, config.cache.albumMs, () => fetchAlbum(input));
    res.json({ data });
  }),
);

api.post(
  '/probe',
  asyncRoute(async (req, res) => {
    const input = parseBody(probeSchema, req.body);
    const key = `probe:${input.platform}:${input.songid}:${input.format}:${input.bitrate}:${input.time ?? ''}:${input.sign ?? ''}:${input.expectedDurationSeconds}`;
    const data = await cached(key, config.cache.probeMs, () => probeSource(input));
    res.json({ data });
  }),
);

api.post(
  '/check',
  asyncRoute(async (req, res) => {
    const input = parseBody(checkSchema, req.body);
    const signature = input.qualities.map((item) => `${item.format}:${item.bitrate}`).join(',');
    const key = `check:${input.platform}:${input.songid}:${input.time ?? ''}:${input.sign ?? ''}:${input.expectedDurationSeconds}:${signature}`;
    const data = await cached(key, config.cache.probeMs, () => checkQualities(input));
    res.json({ data });
  }),
);

api.post(
  '/download',
  downloadLimiter,
  asyncRoute(async (req, res, next) => {
    const input = parseBody(downloadSchema, req.body);
    const jobDir = await createJobDir();
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      void removeJobDir(jobDir);
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);
    req.on('aborted', cleanup);

    try {
      const result = await downloadAndPrepare(input, jobDir);
      const asciiName = result.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
      const encodedName = encodeURIComponent(result.filename);

      res.setHeader('Content-Type', result.mime);
      res.setHeader('Content-Length', String(result.size));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-FLACPlay-Requested-Format', result.requestedFormat);
      res.setHeader('X-FLACPlay-Output-Format', result.outputFormat);
      res.setHeader('X-FLACPlay-Source-Format', result.sourceFormat);
      res.setHeader('X-FLACPlay-Source-Codec', result.sourceCodec);
      res.setHeader('X-FLACPlay-Actual-Bitrate', String(result.actualBitrate));
      res.setHeader('X-FLACPlay-Verified', result.verified ? '1' : '0');
      res.setHeader('X-FLACPlay-Actual-Duration', String(Math.round(result.actualDuration)));
      res.setHeader('X-FLACPlay-Converted', result.converted ? '1' : '0');
      res.setHeader('X-FLACPlay-Cover', result.hasCover ? '1' : '0');
      if (result.hasCover && result.coverWidth && result.coverHeight) {
        res.setHeader('X-FLACPlay-Cover-Resolution', `${result.coverWidth}x${result.coverHeight}`);
      }
      res.setHeader('X-FLACPlay-Preview', '0');

      const stream = createReadStream(result.path);
      stream.on('error', next);
      stream.pipe(res);
    } catch (error) {
      cleanup();
      throw error;
    }
  }),
);

api.use((req, res) => {
  console.warn(
    `[${new Date().toISOString()}] api_not_found method=${req.method} path=${req.originalUrl} request=${req.requestId}`,
  );
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Ese recurso de la API no existe.' },
  });
});

app.use('/api', api);

if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      },
    }),
  );

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/assets/')) {
      console.warn(
        `[${new Date().toISOString()}] asset_not_found path=${req.originalUrl} request=${req.requestId}`,
      );
      res.status(404).type('text/plain').send('Asset no encontrado');
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'), {
      headers: { 'Cache-Control': 'no-cache' },
    });
  });
}

app.use((error, req, res, _next) => {
  const publicError = toPublicError(error);
  if (publicError.status >= 500) {
    console.error(
      `[${new Date().toISOString()}] request_failed status=${publicError.status} method=${req.method} path=${req.originalUrl} request=${req.requestId}`,
      error,
    );
  }
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.status(publicError.status).json(publicError.body);
});

const server = app.listen(config.port, config.host, () => {
  console.log(
    `[${new Date().toISOString()}] FLAC Play API v${version} en http://${config.host}:${config.port} (${config.env})`,
  );
  if (!fs.existsSync(distDir)) {
    console.log('Aviso: dist/ no existe. Usa `npm run dev` o ejecuta `npm run build` antes de `npm start`.');
  }
});

server.on('error', (error) => {
  console.error(`[${new Date().toISOString()}] server_error`, error);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 100).unref();
});

process.on('unhandledRejection', (reason) => {
  console.error(`[${new Date().toISOString()}] unhandled_rejection`, reason);
});

process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] uncaught_exception`, error);
  setTimeout(() => process.exit(1), 100).unref();
});

function shutdown(signal) {
  console.log(`[${new Date().toISOString()}] ${signal} recibido. Cerrando FLAC Play…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { app, server };
