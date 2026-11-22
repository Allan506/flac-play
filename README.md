# FLAC Play

Buscador y reproductor de música con interfaz en español para los catálogos de **Kuwo** y **NetEase**. Permite buscar, escuchar, leer la letra, consultar el álbum y preparar descargas en FLAC o MP3.

El proyecto incluye un frontend React/Vite y un servidor Express que actúa como proxy de la API de origen, resuelve las URLs de audio, comprueba el formato real y la duración con `ffprobe` y prepara el archivo final con `ffmpeg`. Si la fuente etiqueta una calidad como FLAC pero entrega MP3, el archivo nunca se renombra: se rechaza o se descarga como MP3 real.

## Requisitos

- Node.js 20 o superior.
- `ffmpeg` y `ffprobe`. El proyecto usa los binarios estáticos de `ffmpeg-static` y `ffprobe-static`, que se instalan con las dependencias.

## Puesta en marcha

```bash
npm install
npm run dev
```

- Frontend de desarrollo: `http://localhost:12000`
- API de desarrollo: `http://localhost:12001`

Para producción:

```bash
npm run build
npm start
```

El servidor sirve `dist/` y la API en el mismo puerto (`12000` por defecto).

### Docker

```bash
docker build -t flac-play .
docker run --rm -p 12000:12000 flac-play
```

La imagen incluye `ffmpeg` y `ffprobe` y escribe los trabajos temporales en `/tmp/flacplay`. Puedes cambiar el catálogo de origen con `-e UPSTREAM_API=https://...`.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Vite y API con recarga automática. |
| `npm run build` | Comprueba tipos y genera `dist/`. |
| `npm start` | Servidor de producción. |
| `npm test` | Pruebas unitarias con Vitest. |
| `npm run typecheck` | TypeScript sin emitir archivos. |

## Configuración

Todas las variables son opcionales.

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `PORT` | `12000` | Puerto HTTP. |
| `HOST` | `0.0.0.0` | Interfaz de escucha. |
| `UPSTREAM_API` | `https://flacplay-ik32bcxq.manus.space` | API de catálogo. |
| `UPSTREAM_TIMEOUT_MS` | `25000` | Tiempo máximo por petición al catálogo. |
| `DOWNLOAD_TIMEOUT_MS` | `180000` | Tiempo máximo para descargar una pista. |
| `MAX_DOWNLOAD_BYTES` | `251658240` | Límite de tamaño de descarga. |
| `TEMP_DIR` | `.tmp/downloads` | Directorio temporal de trabajos. |
| `FFMPEG_PATH` | binario de `ffmpeg-static` | Ruta a `ffmpeg`. |
| `FFPROBE_PATH` | binario de `ffprobe-static` | Ruta a `ffprobe`. |

## API

Todas las respuestas correctas usan `{ "data": ... }`. Los errores usan `{ "error": { "code": "...", "message": "..." } }`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Estado del servidor y versión. |
| `GET` | `/api/config` | Catálogos, tamaño de página y límites. |
| `POST` | `/api/search` | Busca pistas por palabra clave y catálogo. |
| `POST` | `/api/resolve` | Resuelve la URL de audio de una calidad. |
| `POST` | `/api/lyrics` | Obtiene la letra sincronizada. |
| `POST` | `/api/album` | Obtiene la ficha y las pistas de un álbum. |
| `POST` | `/api/probe` | Comprueba una única calidad. |
| `POST` | `/api/check` | Comprueba varias calidades y recomienda una. |
| `POST` | `/api/download` | Prepara y entrega el archivo final. |

### Comprobación de calidades

`POST /api/check` recibe el catálogo, la pista y la lista de calidades. El servidor resuelve cada calidad de forma secuencial para no saturar la fuente y devuelve:

```json
{
  "qualities": [
    {
      "format": "flac",
      "bitrate": "948",
      "available": true,
      "sourceFormat": "mp3",
      "actualFormat": "mp3",
      "actualBitrate": 128,
      "formatMismatch": true,
      "contentType": "audio/mpeg",
      "contentLength": 481115,
      "expectedDurationSeconds": 294,
      "likelyPreview": true,
      "error": ""
    }
  ],
  "recommended": { "format": "mp3", "bitrate": "320" },
  "allPreview": false
}
```

La comprobación es **orientativa**: el servidor lee los primeros 64 KB, detecta el formato real por sus bytes y reintenta la resolución hasta tres veces si la calidad pedida no coincide. Aun así, algunos servidores entregan variantes distintas entre peticiones. Por eso la decisión definitiva se toma al descargar: `ffprobe` identifica el códec real y mide la duración. Si es una vista previa, el servidor responde `422 PREVIEW_ONLY`; si se pidió FLAC y el archivo real es MP3, responde `422 SOURCE_FORMAT_MISMATCH`. En ningún caso se guarda un archivo parcial ni se cambia la extensión para simular un formato.

### Descarga

`POST /api/download` recibe `platform`, `songid`, `format`, `outputFormat`, `bitrate`, `time`, `sign`, metadatos y duración esperada. El servidor:

1. Resuelve la URL de audio.
2. Descarga a un directorio temporal con límite de tamaño.
3. Identifica el códec real y la duración con `ffprobe`.
4. Si se pidió FLAC y el archivo real no es FLAC, reintenta hasta tres veces con una resolución nueva. Si sigue sin ser FLAC, responde `422 SOURCE_FORMAT_MISMATCH` con el formato real detectado; nunca convierte MP3 a FLAC para simular pérdida cero.
5. Si detecta una vista previa, reintenta y, si vuelve a fallar, responde `422 PREVIEW_ONLY`.
6. Convierte a MP3 cuando se pide MP3, o incrusta metadatos y portada con `ffmpeg` cuando hace falta.
7. Verifica de nuevo el códec del archivo final con `ffprobe`. Si no coincide con `outputFormat`, responde `502 OUTPUT_FORMAT_MISMATCH`.
8. Entrega el archivo con la extensión y el `Content-Type` reales, y elimina el directorio temporal.

La respuesta incluye cabeceras de verificación: `X-FLACPlay-Requested-Format`, `X-FLACPlay-Source-Format`, `X-FLACPlay-Source-Codec`, `X-FLACPlay-Output-Format`, `X-FLACPlay-Actual-Bitrate` y `X-FLACPlay-Verified`.

## Pruebas

```bash
npm test
```

Cubren el formato de duraciones y tamaños, el parser LRC, los filtros de búsqueda y la detección de FLAC, MP3, M4A y OGG por bytes y por códec de `ffprobe`.

## Limitaciones conocidas

- La disponibilidad y la calidad dependen de la fuente. Una pista puede existir en el catálogo pero devolver una vista previa o fallar temporalmente.
- No hay cuentas ni base de datos. El historial y las preferencias se guardan en `localStorage`.
- La aplicación no aloja audio ni elude protecciones de la fuente. Descarga solo contenido al que tengas derecho de acceso.

## Estructura

```
server/        API Express, caché, validación, resolución y descarga
src/           Frontend React, componentes, hooks y estilos
tests/         Pruebas unitarias de Vitest
public/        Recursos estáticos
dist/          Build de producción
```
