# Despliegue

## El catálogo vive fuera: no lo apagues

La búsqueda, la resolución de audio, las letras y los datos de álbum se piden a `UPSTREAM_API`
(por defecto `https://flacplay-ik32bcxq.manus.space`). Este servidor solo descarga, verifica,
convierte y prepara el archivo.

Si `UPSTREAM_API` no responde, la app contesta:

```json
{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"El catálogo no respondió. Puede estar despertando; vuelve a intentarlo en unos segundos."}}
```

Ese servicio se suspende por inactividad y tarda unos segundos en despertar. El servidor reintenta
tres veces con espera creciente, así que la primera búsqueda tras una pausa puede tardar pero suele
resolver. Si vas a desplegar la app en otro sitio, mantén el catálogo encendido o apunta
`UPSTREAM_API` a un reemplazo que devuelva el mismo contrato (`/api/search`, `/api/resolve`,
`/api/lyrics`, `/api/album`).

## Opción A: Render (Docker, plan gratuito)

1. Entra en Render → **New** → **Blueprint** y elige este repositorio.
2. Render lee `render.yaml`, construye con el `Dockerfile` (incluye ffmpeg y ffprobe) y publica
   en un `https://<servicio>.onrender.com`.
3. En el panel del servicio, define `UPSTREAM_API` con la URL del catálogo.
4. Comprueba `https://<servicio>.onrender.com/api/health`: debe devolver
   `"tools": {"ffmpeg": true, "ffprobe": true}` y `"degraded": false`.

El plan gratuito duerme el servicio tras un rato sin tráfico; la primera petición tras la pausa
tarda unos segundos, pero no aparece el error de "no available server" de Manus.

## Opción B: cualquier VPS con Docker

```bash
git clone https://github.com/Allan506/flac-play.git
cd flac-play
UPSTREAM_API=https://tu-catalogo docker compose up -d --build
curl http://127.0.0.1:12000/api/health
```

`docker-compose.yml` ya trae `restart: unless-stopped`, `init: true` y un healthcheck contra
`/api/health`, así que el servicio vuelve solo tras un reinicio del servidor.

## Opción C: Fly.io

```bash
fly launch --no-deploy --dockerfile Dockerfile
fly secrets set UPSTREAM_API=https://tu-catalogo
fly deploy
```

## Variables de entorno

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `PORT` | `12000` | Puerto HTTP. Render y Fly lo inyectan solos. |
| `UPSTREAM_API` | `https://flacplay-ik32bcxq.manus.space` | Catálogo de búsqueda y resolución. |
| `TEMP_DIR` | `.tmp/downloads` | Archivos temporales de cada descarga. |
| `FFMPEG_PATH` / `FFPROBE_PATH` | autodetectado | Fuerza un binario concreto. |
| `CONNECT_TIMEOUT_MS` | `20000` | Tiempo máximo para abrir conexión con el CDN. |
| `UPSTREAM_TIMEOUT_MS` | `25000` | Tiempo máximo por intento contra el catálogo. |
| `DOWNLOAD_TIMEOUT_MS` | `180000` | Tiempo máximo de descarga por intento. |

## Comprobaciones tras desplegar

```bash
curl -s https://<host>/api/health
curl -s -X POST https://<host>/api/search -H 'Content-Type: application/json' \
  -d '{"platform":"kuwo","keyword":"adele","page":1}' | head -c 200
```

La segunda debe devolver `"code":0` con pistas. Si devuelve `UPSTREAM_UNAVAILABLE`, el problema
está en `UPSTREAM_API`, no en el despliegue.
