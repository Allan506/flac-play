# FLAC Play

Buscador y reproductor de música con interfaz en español para dos catálogos: **Kuwo** y **NetEase**. Permite buscar, escuchar, leer la letra, consultar el álbum y preparar descargas en FLAC o MP3.

Los catálogos abiertos se resuelven en el propio servidor, sin depender de la API de Kuwo: cada adaptador (`server/sources/`) consulta la API pública correspondiente, filtra los archivos que no son FLAC y devuelve la misma forma de pista que los catálogos originales, de modo que la interfaz y la verificación funcionan igual en los cinco.

El proyecto incluye un frontend React/Vite y un servidor Express que actúa como proxy de la API de origen, resuelve las URLs de audio, comprueba el formato real y la duración con `ffprobe` y prepara el archivo final con `ffmpeg`. Si la fuente etiqueta una calidad como FLAC pero entrega MP3, el archivo nunca se renombra: se rechaza o se descarga como MP3 real.

## Requisitos

- Node.js 20 o superior.
- `ffmpeg` y `ffprobe`. El proyecto usa los binarios estáticos de `ffmpeg-static` y `ffprobe-static`, que se descargan al instalar las dependencias. Si el sistema ya tiene `ffmpeg`/`ffprobe` en el `PATH`, o defines `FFMPEG_PATH`/`FFPROBE_PATH`, se usan esos.
- npm 12 bloquea los scripts de instalación de dependencias por defecto. `package.json` incluye `allowScripts` para `ffmpeg-static`; si el binario no se descarga, `npm install` termina igualmente y las descargas fallarían con `503 TOOLS_UNAVAILABLE`. Instala `ffmpeg` en el sistema como alternativa.

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

El servidor sirve `dist/` y la API en el mismo puerto (`12000` por defecto). `npm start` ejecuta el supervisor, que reinicia el servidor si termina inesperadamente (con retroceso exponencial) y lo reinicia si `/api/health` falla tres veces seguidas. Si el contenedor completo se reinicia, el orquestador debe arrancar el servicio; usa Docker Compose o el mecanismo de arranque de tu plataforma. Para ejecutar el servidor sin supervisor usa `npm run start:once`.

### Docker

```bash
docker compose up -d --build
```

El `docker-compose.yml` incluye `restart: unless-stopped` y un `healthcheck` contra `/api/health`. También puedes construir manualmente:

```bash
docker build -t flac-play .
docker run --restart unless-stopped -p 12000:12000 flac-play
```

La imagen incluye `ffmpeg` y `ffprobe` y escribe los trabajos temporales en `/tmp/flacplay`. Puedes cambiar el catálogo de origen con `-e UPSTREAM_API=https://...`.

### Diagnóstico

- Cada respuesta incluye `X-Request-Id`; los logs del servidor usan ese identificador.
- Los 404 de la API se registran como `api_not_found` con método, ruta y request ID.
- Los 404/429 de la fuente se registran como `upstream_not_found` / `upstream_rate_limited` con la ruta y el payload.
- Los errores 5xx se registran como `request_failed`; los fallos no capturados se registran como `unhandled_rejection` o `uncaught_exception`.
- Comprueba el estado con `curl http://127.0.0.1:12000/api/health`. El campo `tools` indica si `ffmpeg` y `ffprobe` están disponibles, y `degraded` es `true` cuando falta alguno.
- Si una descarga responde `503 TOOLS_UNAVAILABLE`, el servidor no encontró `ffmpeg`/`ffprobe`. Ejecuta `npm install` (con `allowScripts` habilitado), instala `ffmpeg` en el sistema o define `FFMPEG_PATH`/`FFPROBE_PATH`.
- El log `transcode_failed` incluye el `stderr` de `ffmpeg` para diagnosticar fallos de conversión.
- `scripts/serve-prod.sh` reinicia el servidor con retroceso exponencial (máximo 30 s) si cae en bucle; el aviso `ffmpeg no encontrado` aparece al arrancar.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Vite y API con recarga automática. |
| `npm run build` | Comprueba tipos y genera `dist/`. |
| `npm start` | Servidor de producción con supervisor y healthcheck. |
| `npm run start:supervised` | Igual que `npm start` (alias explícito). |
| `npm run start:once` | Servidor de producción sin supervisor (depuración). |
| `npm test` | Pruebas unitarias con Vitest. |
| `npm run typecheck` | TypeScript sin emitir archivos. |
| `npm run verify:sources` | Comprueba contra la API real los dos catálogos: búsqueda, resolución, `ffprobe` y descarga. Acepta `VERIFY_PLATFORMS=kuwo,wyy` y `VERIFY_KEYWORD`. |

## Configuración

Todas las variables son opcionales.

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `PORT` | `12000` | Puerto HTTP. |
| `HOST` | `0.0.0.0` | Interfaz de escucha. |
| `UPSTREAM_API` | `https://flacplay-ik32bcxq.manus.space` | API de catálogo (Kuwo y NetEase). |
| `JAMENDO_CLIENT_ID` | vacío | Clave de la API oficial de Jamendo. Sin ella se usa Openverse, que también devuelve FLAC de Jamendo pero no permite abrir álbumes. |
| `NETEASE_NATIVE` | `true` | Resuelve NetEase en el servidor en vez de delegar en la API de catálogo. |
| `UPSTREAM_TIMEOUT_MS` | `25000` | Tiempo máximo por petición al catálogo. |
| `DOWNLOAD_TIMEOUT_MS` | `180000` | Tiempo máximo para descargar una pista. |
| `MAX_DOWNLOAD_BYTES` | `251658240` | Límite de tamaño de descarga. |
| `TEMP_DIR` | `.tmp/downloads` | Directorio temporal de trabajos. |
| `FFMPEG_PATH` | binario de `ffmpeg-static` | Ruta a `ffmpeg`. |
| `FFPROBE_PATH` | binario de `ffprobe-static` | Ruta a `ffprobe`. |
| `CORS_ORIGINS` | vacío (cualquier origen) | Lista separada por comas de orígenes permitidos. Necesaria si el frontend se sirve desde otro dominio, como GitHub Pages. |
| `VITE_API_BASE` | vacío (mismo origen) | Origen de la API que usa el frontend al compilar. |
| `VITE_BASE` | `/` | Ruta base del frontend al compilar. En GitHub Pages es `/flac-play/`. |

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
6. Convierte a MP3 cuando se pide MP3, o incrusta metadatos y portada con `ffmpeg` cuando hace falta. La portada se pide en su resolución máxima: 1200 px en Kuwo (con 500, 300 y el tamaño original como alternativas) y la imagen original en NetEase.
7. Verifica de nuevo el códec del archivo final con `ffprobe`. Si no coincide con `outputFormat`, responde `502 OUTPUT_FORMAT_MISMATCH`.
8. Entrega el archivo con la extensión y el `Content-Type` reales, y elimina el directorio temporal.

La respuesta incluye cabeceras de verificación: `X-FLACPlay-Requested-Format`, `X-FLACPlay-Source-Format`, `X-FLACPlay-Source-Codec`, `X-FLACPlay-Output-Format`, `X-FLACPlay-Actual-Bitrate`, `X-FLACPlay-Verified`, `X-FLACPlay-Cover` y, cuando hay portada, `X-FLACPlay-Cover-Resolution` (por ejemplo `1200x1200`).

### Catálogos

| Catálogo | Identificador | Letras | Álbumes | Notas |
| --- | --- | --- | --- | --- |
| Kuwo | `kuwo` | Sí | Sí | Catálogo principal; entrega FLAC de 16/44,1 y, en algunas pistas, de 24 bits. |
| NetEase | `wyy` | Sí | Sí | Pide primero el nivel `jymaster`, después `hires` y por último `lossless`. Sin cookie, NetEase no entrega audio y el servidor busca la misma pista en Kuwo. |

La única vía de audio sin pérdida son Kuwo y NetEase. Los catálogos abiertos (Internet Archive, Jamendo y Wikimedia Commons) se retiraron: sus FLAC rara vez son másters y muchos son digitalizaciones recodificadas. `POST /api/search`, `/api/resolve`, `/api/lyrics` y `/api/album` rechazan cualquier `platform` que no sea `kuwo` o `wyy`.

### FLAC auténtico

Un FLAC puede ser sin pérdida de verdad o un archivo con pérdida recodificado (por ejemplo un MP3 320 renombrado). El formato y la duración no lo revelan, así que el servidor mide el espectro con `ffmpeg` y compara el corte real con el **Nyquist real del propio archivo**: 22,05 kHz en 44,1 kHz, 24 kHz en 48 kHz, 48 kHz en 96 kHz, 5,5 kHz en un 78 rpm digitalizado a 11 kHz.

**Ningún archivo con extensión `.flac` sale del servidor si no es FLAC sin pérdida.** La regla es única y no tiene excepciones ni interruptores: `evaluateFlacDelivery()` exige veredicto `lossless` sobre el archivo de origen y repite el análisis sobre el archivo ya preparado, después de incrustar metadatos y portada. Si cualquiera de las dos medidas falla, la descarga se corta con `422 LOSSLESS_NOT_VERIFIED` y el archivo nunca llega al navegador.

Cómo se mide:

- Se decodifican hasta tres ventanas de 12 s de la **parte que de verdad está en el archivo** (en un prefijo remoto se reparten dentro de los bytes descargados, no de la duración anunciada) y se toma el **corte máximo**: una pasada tranquila no puede marcar como recortado un FLAC íntegro, y un archivo con pérdida no puede superar su techo en ninguna ventana.
- El corte es la frecuencia más alta con contenido audible por encima de `pico − 85 dB`, con la media móvil de tres bins.
- Se decodifica a la **frecuencia de muestreo nativa del archivo**, sin remuestrear a 44,1 kHz, para que el Nyquist comparado sea el real.
- Un archivo se considera `lossless` sólo si el corte llega al **99,5 %** del Nyquist real (21,94 kHz de 22,05 kHz en 44,1 kHz). Los codificadores con pérdida medidos en este proyecto (MP3 128, 192, 256 y 320 de LAME) se quedan en el 92-96 %, y los FLAC auténticos del catálogo miden 99,7-100 %.
- Se comprueba la firma MD5 del `STREAMINFO` decodificando el archivo completo: un FLAC corrupto se rechaza con `422 LOSSLESS_INTEGRITY_FAILED` aunque el espectro sea perfecto.
- **Prueba de muestras idénticas:** se calcula el SHA-256 del PCM decodificado del origen y del archivo preparado. Si no coinciden, la descarga se rechaza con `422 LOSSLESS_AUDIO_CHANGED`. Es lo que garantiza que incrustar metadatos y portada no cambia ni una muestra y que nunca se entrega un FLAC remuestreado o rebajado de profundidad.

Veredictos posibles: `lossless` (corte ≥ 99,5 % del Nyquist real), `high-cut` (entre el 86 % y el 99,5 %: compatible con una recodificación con pérdida), `transcoded` (por debajo del 86 %, claramente con pérdida), `not-flac` (los bytes no son FLAC) y `unknown` (no se pudo medir). Sólo `lossless` se entrega.

Como el listón es el Nyquist real, un FLAC de 96 kHz sobremuestreado desde un máster de 44,1 kHz se rechaza: mide 22 kHz de 48 kHz posibles. También se rechazan los FLAC de 192 kHz de Commons que sólo llevan contenido hasta 22 kHz.

Consecuencia asumida: un máster legítimo pero muy limitado de banda (por ejemplo un FLAC con contenido sólo hasta 15 kHz) tampoco se entrega como FLAC, porque es indistinguible de un archivo recodificado con pérdida. En esos casos la interfaz explica el corte medido y ofrece las calidades MP3 del catálogo.

### Máximo esfuerzo antes de rechazar

Rechazar no es el primer recurso. Cuando el FLAC de la pista pedida no llega al Nyquist real, el servidor (`server/rescue.mjs` + `findVerifiedTwin()` en `server/download.mjs`) busca copias alternativas y verifica cada una con el mismo análisis:

1. Otra edición de la misma canción en el mismo catálogo (single, recopilatorio, otra remasterización).
2. La misma pista en el catálogo gemelo: Kuwo ↔ NetEase.

Sólo se para en la primera copia que mide `lossless`; se descartan los karaokes, homenajes y versiones instrumentales, se exige título equivalente y una duración a menos de 6 s de la pedida, y se prefieren las coincidencias exactas de título. La descarga vuelve a verificar el archivo elegido byte a byte, así que el rescate nunca rebaja la garantía. En la interfaz, el diálogo de descarga avisa de que se entrega otra edición o la copia del otro catálogo y del corte medido en la original.

Para NetEase se piden los niveles en orden de calidad `jymaster` → `hires` → `lossless`; sin cookie de cuenta, NetEase no entrega audio y el servidor resuelve la pista con la copia equivalente de Kuwo. Con `FLAC_RESCUE=false` se desactiva la búsqueda de copias alternativas (la verificación estricta sigue intacta).

`POST /api/check` sigue aceptando `requireLossless` para filtrar la lista de calidades antes de descargar; en `/api/download` la exigencia es siempre la misma, se pida o no.

La descarga añade `X-FLACPlay-Lossless-Verdict`, `X-FLACPlay-Lossless-Label`, `X-FLACPlay-Lossless-Cutoff-Hz`, `X-FLACPlay-Lossless-Limit-Hz`, `X-FLACPlay-Lossless-Integrity`, `X-FLACPlay-Lossless-Bits`, `X-FLACPlay-Lossless-Sample-Rate` y `X-FLACPlay-Lossless-Bitexact`. Si el FLAC no supera la comprobación de integridad (la firma MD5 del audio no coincide), responde `422 LOSSLESS_INTEGRITY_FAILED`; si el archivo preparado no conserva las muestras exactas del origen, `422 LOSSLESS_AUDIO_CHANGED`.

En la interfaz, el ajuste **Solo FLAC verificado** (Ajustes, se guarda en `localStorage`) filtra la búsqueda y los álbumes a pistas con FLAC, reproduce solo en FLAC y muestra en el diálogo de descarga el corte medido antes de bajar el archivo. Una calidad FLAC cuyo análisis no llega al espectro completo aparece como `No sin pérdida` con el corte medido y no se puede descargar; no hay botón para forzarla.

## GitHub Pages

El frontend es estático, así que se puede publicar en GitHub Pages apuntando a un servidor propio:

- `https://allan506.github.io/flac-play/` sirve la interfaz.
- La API sigue viviendo en `https://flac-play.onrender.com`.

El flujo `.github/workflows/pages.yml` compila con `VITE_BASE=/flac-play/` y `VITE_API_BASE=https://flac-play.onrender.com`, ejecuta las pruebas, copia `index.html` a `404.html` para las rutas profundas y publica en Pages. Se dispara con cada push a `main` o a mano desde la pestaña *Actions*.

El servidor responde a las peticiones cruzadas con `Access-Control-Allow-Origin` y expone las cabeceras `X-FLACPlay-*` y `Content-Disposition`. Sin ese CORS, el navegador bloquea la respuesta y la interfaz no puede leer el veredicto de FLAC ni el nombre del archivo. Para limitar quién puede llamar a la API, define `CORS_ORIGINS` con los orígenes permitidos; sin la variable se acepta cualquier origen, igual que una llamada directa con `curl`.

## Pruebas

```bash
npm test
```

Cubren el formato de duraciones y tamaños, el parser LRC, los filtros de búsqueda, la detección de FLAC, MP3, M4A y OGG por bytes y por códec de `ffprobe`, la selección de portadas en máxima resolución, los veredictos de espectro del FLAC auténtico, la selección de candidatos en modo estricto, los adaptadores de los tres catálogos abiertos y la validación de identificadores (Kuwo y NetEase exigen identificadores numéricos).

`tests/flac-lossless-enforcement.test.ts` genera audio real con `ffmpeg` y comprueba la garantía de arriba: ruido blanco de banda completa en FLAC (se acepta), el mismo audio pasado por MP3 128 y MP3 320 antes de guardarse como FLAC (se rechaza), un MP3 sólo renombrado a `.flac` (se rechaza por bytes y por códec), audio reducido a 8 kHz y reescalado a 44,1 kHz (se rechaza) y un FLAC de 96 kHz (se acepta). Si `ffmpeg` no está disponible, esas pruebas se omiten y el resto de la suite sigue corriendo.

Para comprobar los catálogos reales, con el servidor en marcha:

```bash
VERIFY_PLATFORMS=kuwo,wyy npm run verify:sources
```

El script busca, resuelve, ejecuta `ffprobe` y descarga la primera pista de cada catálogo, y termina con un resumen de comprobaciones correctas.

## Limitaciones conocidas

- La disponibilidad y la calidad dependen de la fuente. Una pista puede existir en el catálogo pero devolver una vista previa o fallar temporalmente.
- Kuwo depende de la API de catálogo: cuando esa API rechaza la resolución, la pista no se puede escuchar aunque aparezca en los resultados.
- NetEase sin cookie no entrega audio: el servidor usa entonces la copia equivalente de Kuwo, verificada con el mismo análisis de espectro.
- Los archivos grandes se descargan en el navegador como `Blob`; en móviles con poca memoria conviene elegir MP3 o un FLAC de menos de ~50 MB.
- No hay cuentas ni base de datos. El historial y las preferencias se guardan en `localStorage`.
- La aplicación no aloja audio ni elude protecciones de la fuente. Descarga solo contenido al que tengas derecho de acceso.

## Estructura

```
server/            API Express, caché, validación, resolución y descarga
src/               Frontend React, componentes, hooks y estilos
tests/             Pruebas unitarias de Vitest
scripts/           Supervisor de producción y verificación de catálogos
public/            Recursos estáticos
dist/              Build de producción
docker-compose.yml Despliegue con reinicio automático y healthcheck
```
