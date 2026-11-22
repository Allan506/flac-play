# FLAC Play

Buscador y reproductor de música con interfaz en español para los catálogos de **Kuwo** y **NetEase**. Permite buscar, escuchar, leer la letra, consultar el álbum y preparar descargas en FLAC o MP3.

El proyecto incluye un frontend React/Vite y un servidor Express que actúa como proxy de la API de origen, resuelve las URLs de audio, comprueba la duración real con `ffprobe` y prepara el archivo final con `ffmpeg`.

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
      "sourceFormat": "flac",
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

La comprobación es **orientativa**: algunos servidores declaran un tamaño completo en `HEAD` y luego entregan una vista previa en `GET`. Por eso la decisión definitiva se toma al descargar: `ffprobe` mide la duración real y, si es una vista previa, el servidor responde `422 PREVIEW_ONLY` sin guardar un archivo parcial. La interfaz muestra ese resultado y ofrece la mejor alternativa disponible.

### Descarga

`POST /api/download` recibe `platform`, `songid`, `format`, `outputFormat`, `bitrate`, `time`, `sign`, metadatos y duración esperada. El servidor:

1. Resuelve la URL de audio.
2. Descarga a un directorio temporal con límite de tamaño.
3. Verifica la duración real con `ffprobe`.
4. Si detecta una vista previa, reintenta una vez con una resolución nueva y, si vuelve a fallar, responde `422`.
5. Convierte o incrusta metadatos y portada con `ffmpeg` cuando hace falta.
6. Entrega el archivo y elimina el directorio temporal.

## Pruebas

```bash
npm test
```

Cubren el formato de duraciones y tamaños, el parser LRC y los filtros de búsqueda.

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
