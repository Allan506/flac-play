# AGENTS.md

## Commands

- `npm run dev` — Vite frontend on 12000, API on 12001.
- `npm run build` — typecheck and build `dist/`.
- `npm test` — Vitest (`tests/**/*.test.ts`).
- `npm start` — production server under `scripts/serve-prod.sh` (supervisor + health watchdog).
- `npm run start:once` — plain `node server/index.mjs` for debugging.

`ffmpeg`/`ffprobe` are resolved in this order: `FFMPEG_PATH`/`FFPROBE_PATH`, the static package binaries, then the `PATH` (`/usr/local/bin`, `/usr/bin`, `/bin`, `/opt/homebrew/bin`, `/snap/bin`). `server/tools.mjs` implements the lookup and `server/config.mjs` runs it once at import.

## Format verification

- `server/audio-format.mjs` sniffs magic bytes (`fLaC`, `ID3`/MPEG, `ftyp`, `OggS`) and maps ffprobe codecs.
- `server/download.mjs` always probes the downloaded file with ffprobe and probes the final output again.
- Never rename or transcode MP3/AAC to FLAC to satisfy a FLAC request. Return `422 SOURCE_FORMAT_MISMATCH` instead.
- The upstream can return a `.flac` URL whose content is MP3, or a `.mp3` URL whose content is FLAC. Trust the bytes, not the URL or `Content-Type`.
- FLAC downloads retry the resolve up to three times because the upstream alternates variants between requests.
- `server/audio-format.d.mts` provides TypeScript types for the `.mjs` module used by tests.
- `server/covers.mjs` upgrades covers to the largest available source: Kuwo 1200px with 500/300/original fallbacks, NetEase original without `?param=`.

## Incident notes

- **Downloads returned `502 PREPARATION_FAILED`.** npm 12 blocks dependency install scripts unless they are listed in `allowScripts`, so `ffmpeg-static`'s install script never ran and the binary was missing while `npm install` still exited 0. Every download embeds metadata or a cover, so it always passes through `transcode` and failed. Fix: `allowScripts` in `package.json`, runtime tool resolution with system/PATH fallbacks, `503 TOOLS_UNAVAILABLE` instead of a misleading 502, `tools`/`degraded` in `/api/health`, `transcode_failed` logs with ffmpeg `stderr`, and the Docker runtime installs distro `ffmpeg` with `FFMPEG_PATH`/`FFPROBE_PATH` set.
- **Intermittent `504` on Kuwo downloads.** Node's built-in fetch aborts a TCP connect after 10 s, and some Kuwo CDN addresses are slow, so 3 attempts died at ~12 s each. `server/http.mjs` uses an `undici` Agent with a 20 s connect timeout and socket reuse; MP3 downloads went from ~50 % failures to 3/3 successes.
- **A native catalog client is not viable without the Manus service.** Probed from the workspace: Kuwo metadata works (`search.kuwo.cn/r.s` returns `MINFO` with real sizes; `m.kuwo.cn/newh5/singles/songinfoandlrc` returns LRC; `stype=albuminfo` returns albums), but Kuwo audio is blocked: `antiserver.kuwo.cn/anti.s` answers with 5-11 s trial clips for every rid and `www.kuwo.cn/api/v1/www/music/playUrl` rejects requests with `The request is illegal!` unless the JS-generated `Secret` header is present. NetEase metadata works (`api/search/get`, `api/song/lyric`, `api/v1/album/<id>`), but `api/song/enhance/player/url` returns `url: null` for every track without a `MUSIC_U` cookie. Conclusion: keep `UPSTREAM_API`; it is the only working resolver.
- `UPSTREAM_API` sleeps when idle. `requestUpstream` retries three times (700 ms, 1800 ms) and turns a connection failure into "El catálogo no respondió. Puede estar despertando…" so the first search after a pause explains itself.
- The reported 404 was not a missing frontend route. The upstream answers unknown/renamed paths with HTML 404 (`Cannot POST /api/...`), and stale results could send an album ID from the previous catalog after a failed search/platform switch. Both paths are now handled.
- The server stop was a `SIGTERM` followed by a full workspace restart: PID 1 (agent server) had a later start time than the app. A single `nohup node` process cannot survive that. Use `npm start` (supervisor) for process crashes/health failures; use Docker Compose or the platform's service manager for full container restarts.
- Logs now include ISO timestamps, `X-Request-Id`, `api_not_found`, `upstream_not_found`, `upstream_rate_limited`, `request_failed`, `unhandled_rejection`, and `uncaught_exception`.
- `scripts/serve-prod.sh` is the supervisor behind `npm start`; it restarts the child with exponential backoff and has a three-strike health watchdog.
- After a workspace/container restart, run `npm start` again (or `docker compose up -d --build` when Docker is available). Nothing inside the workspace can survive a full container restart by itself.

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

## Kuwo artist queries

- Kuwo answers artist-style queries (`jay chou`, `周杰伦`) with `total > 0` and an empty `list`, because it matches an artist card instead of songs. `server/upstream.mjs` keeps `fallbackKeywords()` and `fetchSearchPage()`: when the first page is empty but `total > 0`, it retries the individual words (longest first, 1-character tokens and duplicates dropped, original case preserved). `tests/search-fallback.test.ts` covers the keyword builder.

## UI conventions that already bit us

- Modal titles live in `.modal-heading`, which owns its horizontal padding (`1.15rem`). Anything rendered as a direct child of `.modal-card` needs that padding itself, or the text hits the card edge on mobile.
- Long upstream text (Kuwo album blurbs are Chinese and ~2 400 characters) is clamped with `.album-desc` (`-webkit-line-clamp: 4`) plus a "Ver descripción completa" toggle; `.album-hero` uses `align-items: start` so the cover stays visible next to tall copy.
- Anchor scrolling goes through `scrollToId()`, so `#search` and `#catalog` carry `scroll-margin-top: 84px`; without it the sticky `.topbar` covers the section heading.
- Checkboxes inside `.toggle-row` are sized and coloured with `accent-color: var(--accent)`; the row is `align-items: flex-start` so multi-line copy stays aligned with the box.
- The displayed version has a single source: `package.json` → `/api/config` → `Footer`/`SettingsModal`. Do not hardcode it in a component again.

## Mobile checks

- Emulate with CDP: `Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true })`, then compare `document.documentElement.scrollWidth` with `innerWidth` (both must be 390) and screenshot the sheet, lyrics, album and download modals.
- Downloads were verified with iPhone/Android user agents for FLAC (with and without metadata) and MP3 128/320. The payload needs `songid`, `time`, `sign` and `expectedDurationSeconds` from the same search result; a hardcoded id fails with `400 UPSTREAM_UNAVAILABLE` because the duration check rejects it.

## Publishing the frontend

- GitHub Pages serves this repository from the `gh-pages` branch (Settings → Pages → *Deploy from a branch*, `/ (root)`), not from Actions. `npm run publish:pages` builds with `VITE_BASE=/flac-play/` and `VITE_API_BASE=https://flac-play.onrender.com`, copies `index.html` to `404.html`, adds `.nojekyll` and force-pushes `dist/` to `gh-pages`.
- `.github/workflows/pages.yml` repeats that on every push to `main`. Committing a workflow file needs a token with the `workflow` scope, and the job needs *Settings* → *Actions* → *General* → *Workflow permissions* set to read and write; without both, publish from a workstation with `npm run publish:pages`.
- Pushing to `main` also redeploys the Render API (auto-deploy in `render.yaml`), which is where `/api/config` reads the version the footer shows.
