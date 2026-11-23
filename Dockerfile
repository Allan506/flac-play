FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=12000 \
    TEMP_DIR=/tmp/flacplay \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY scripts ./scripts
RUN chown -R node:node /app && mkdir -p /tmp/flacplay && chown -R node:node /tmp/flacplay
USER node
EXPOSE 12000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:12000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["bash", "scripts/serve-prod.sh"]
