# AGENTS.md

## Commands

- `npm run dev` — Vite frontend on 12000, API on 12001.
- `npm run build` — typecheck and build `dist/`.
- `npm test` — Vitest (`tests/**/*.test.ts`).
- `NODE_ENV=production PORT=12000 node server/index.mjs` — production server.

`ffmpeg`/`ffprobe` are not on `PATH`. Use the static binaries:

- `node_modules/ffmpeg-static/ffmpeg`
- `node_modules/ffprobe-static/bin/linux/x64/ffprobe`

## Format verification

- `server/audio-format.mjs` sniffs magic bytes (`fLaC`, `ID3`/MPEG, `ftyp`, `OggS`) and maps ffprobe codecs.
- `server/download.mjs` always probes the downloaded file with ffprobe and probes the final output again.
- Never rename or transcode MP3/AAC to FLAC to satisfy a FLAC request. Return `422 SOURCE_FORMAT_MISMATCH` instead.
- The upstream can return a `.flac` URL whose content is MP3, or a `.mp3` URL whose content is FLAC. Trust the bytes, not the URL or `Content-Type`.
- FLAC downloads retry the resolve up to three times because the upstream alternates variants between requests.
- `server/audio-format.d.mts` provides TypeScript types for the `.mjs` module used by tests.
- `server/covers.mjs` upgrades covers to the largest available source: Kuwo 1200px with 500/300/original fallbacks, NetEase original without `?param=`.

## Incident notes

- The reported 404 was not a missing frontend route. The upstream answers unknown/renamed paths with HTML 404 (`Cannot POST /api/...`), and stale results could send an album ID from the previous catalog after a failed search/platform switch. Both paths are now handled.
- The server stop was a `SIGTERM` followed by a full workspace restart: PID 1 (agent server) had a later start time than the app. A single `nohup node` process cannot survive that. Use `npm run start:supervised` for process crashes/health failures; use Docker Compose or the platform's service manager for full container restarts.
- Logs now include ISO timestamps, `X-Request-Id`, `api_not_found`, `upstream_not_found`, `upstream_rate_limited`, `request_failed`, `unhandled_rejection`, and `uncaught_exception`.
- `scripts/serve-prod.sh` is the supervisor used by `npm run start:supervised`; it restarts the child and has a three-strike health watchdog.
- After a workspace/container restart, run `npm run start:supervised` again (or `docker compose up -d --build` when Docker is available). Nothing inside the workspace can survive a full container restart by itself.

## Search and album robustness

- `performSearch` clears the previous result set before every request. This prevents stale tracks from being acted on with the newly selected catalog (wrong album IDs, wrong resolve calls).
- `ResultsList` distinguishes an empty upstream response from an empty filtered view. Artist-only searches can return `total > 0` with an empty list; show the source-empty message instead of "no filters match".
- The upstream sometimes answers unknown routes with HTML 404. `server/upstream.mjs` maps 404 to a Spanish `502` and retries; 429 maps to `503` and retries. Never surface a raw "404 Not Found" to the UI.
- `albumSchema` rejects zero-only album IDs. `AlbumModal` also guards empty/`0` IDs and shows a clear message without making a request.
- Run the production server under a supervisor if the preview process can be terminated; the API is stateless and safe to restart.

## Verification recipe

Use a Kuwo track with FLAC/MP3 320/MP3 128. Check `/api/check`, then POST `/api/download` and verify the saved file:

```bash
node_modules/ffprobe-static/bin/linux/x64/ffprobe -v error \
  -show_entries format=format_name,duration,bit_rate:stream=codec_name \
  -of json /tmp/file
```

Response headers `X-FLACPlay-Requested-Format`, `X-FLACPlay-Source-Format`, `X-FLACPlay-Output-Format` and `X-FLACPlay-Verified` confirm the delivered format. `X-FLACPlay-Cover-Resolution` should be `1200x1200` for Kuwo covers and the original size (for example `2000x2000`) for NetEase.
