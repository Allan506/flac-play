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

## Verification recipe

Use a Kuwo track with FLAC/MP3 320/MP3 128. Check `/api/check`, then POST `/api/download` and verify the saved file:

```bash
node_modules/ffprobe-static/bin/linux/x64/ffprobe -v error \
  -show_entries format=format_name,duration,bit_rate:stream=codec_name \
  -of json /tmp/file
```

Response headers `X-FLACPlay-Requested-Format`, `X-FLACPlay-Source-Format`, `X-FLACPlay-Output-Format` and `X-FLACPlay-Verified` confirm the delivered format. `X-FLACPlay-Cover-Resolution` should be `1200x1200` for Kuwo covers and the original size (for example `2000x2000`) for NetEase.
