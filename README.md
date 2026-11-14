# TerraJuke — The Earth Information Jukebox

**One Earth. Every Sense. Everyone.**

Team **BoboMimi** (Chia Yuen Kai, Jacy Chiong) · NASA Space Apps Challenge 2026 · Challenge: *The Earth Information Jukebox* · Local Event: Bintulu, Malaysia.

TerraJuke lets people of any ability discover a NASA Earth Information Center (EIC) visualization through live-generated sound, synchronized visual feedback, text descriptions, keyboard and screen-reader access, and optional tactile feedback where supported.

## Origin statement

Repository created during NASA Space Apps 2026 on 2026-11-14 09:10 MYT (UTC+8); independent of the earlier TerraJuke application, which our Local Lead ruled ineligible; none of its code or assets are reused.

The name and concept are the team's. See [SI.md](SI.md) for how software intelligence (AI) was used, [CREDITS.md](CREDITS.md) for NASA data credits and tools, [LIMITATIONS.md](LIMITATIONS.md) for what the app does not claim and the exact mask coordinates, and [BUILD-LOG.md](BUILD-LOG.md) for a timestamped build log.

## The visualization

NASA Scientific Visualization Studio 5313, *Change in Night Lights between 2012 and 2023 – EIC Version* (Black Marble, Suomi NPP VIIRS). Purple = more light, orange = less light, white = little change. The pinned file and its provenance (URL, route, SHA-256, byte-identity check against the Internet Archive copy) are in [public/nasa/](public/nasa/).

## How it works

1. The browser decodes NASA's image and reads its **own legend bar** into a ramp from −1 (orange) through 0 (white) to +1 (purple).
2. The legend, the four magnified insets (duplicates of small map boxes), their labels, box outlines and connector wedges are **masked out**.
3. Each remaining pixel is lit or unlit; lit pixels take the legend position of their colour. A 32 × 9 grid of 32-pixel cells summarizes them.
4. One **FeedbackEvent** per selection drives, at the same moment: a synthesized sound (rising pair = more light, falling pair = less light, single tone = steady; pitch = position along the legend; loudness and 1–4 pulses = lit pixel share; pan = west→east), a ring pulse on the map (a still outline under reduced motion), a visible caption, optional screen-reader text, and optional vibration on supported Android browsers.

Modes: **Explore** (pointer, touch, arrow keys, Enter/Space, Home/End for insets, Escape), **Tour** (the four inset regions, sounded from their map boxes, then every lit cell), **Listen to the legend**, **Describe** (full text and per-region summaries in legend terms).

## Run locally

Node 24.

```bash
npm ci
npm run dev        # http://localhost:5173
npm run check      # unit tests, typecheck + build, Playwright (Chromium + iPhone 13 WebKit)
BASE_URL=https://example.org npx playwright test   # run the browser suite against a deployed site
```

No runtime dependencies; dev dependencies are vite, typescript, @playwright/test and @axe-core/playwright.
