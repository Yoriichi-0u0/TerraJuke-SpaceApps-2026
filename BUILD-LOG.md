# Build log

All times are Malaysia Time (MYT, UTC+8), taken from `TZ=Asia/Kuala_Lumpur date`.

| Time (MYT) | Event |
|---|---|
| 2026-11-14 09:10 | Start gate checked (09:10:07). NASA SVS original URL reachable (HTTP 200, 63,503 bytes); Internet Archive capture 20240921035039 also fetched; both SHA-256 `6e3e92ea…81bc`, byte-identical. gh, Node 24.21, npm 11.19, Playwright browsers and Vercel CLI available. |
| 2026-11-14 09:10 | Repository folder created and `git init`. First commit: README, SI, CREDITS, BUILD-LOG only. |
| 2026-11-14 09:18 | Analysis core committed: pinned NASA file + provenance (`verified-identical`), programmatic layout detection frozen as constants, legend ramp from the image, lit/unlit classification calibrated on the real file, fixed sonification rules. 24 unit tests pass. |
| 2026-11-14 09:2x | Web app: Web Audio voice manager, single FeedbackEvent bus (sound, pulse, caption, optional live text and vibration), Explore / Tour / Legend / Describe, panels. Playwright latest needed chromium-1255 and webkit-2388: installed. Port 4173 was occupied by an unrelated local server, so preview uses 4317. |
| 2026-11-14 09:2x | WebKit (iPhone 13 emulation) sometimes painted a not-yet-decoded image under parallel load, giving an empty analysis. Fixed with `img.decode()` and a legend sanity check with retry; audio errors can no longer stop the visual/text channels. 30/30 Playwright tests pass in three consecutive full runs. |
| 2026-11-14 09:30 | LIMITATIONS.md (claims and exact mask coordinates), final SI.md, README and tool credits. |
