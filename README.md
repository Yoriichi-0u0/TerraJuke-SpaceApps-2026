# TerraJuke — The Earth Information Jukebox

**One Earth. Every Sense. Everyone.**

Team **BoboMimi** (Chia Yuen Kai, Jacy Chiong) · NASA Space Apps Challenge 2026 · Challenge: *The Earth Information Jukebox* · Local Event: Bintulu, Malaysia.

TerraJuke lets people of any ability discover a NASA Earth Information Center (EIC) visualization through live-generated sound, synchronized visual feedback, text descriptions, keyboard and screen-reader access, and optional tactile feedback where supported.

## Origin statement

Repository created during NASA Space Apps 2026 on 2026-11-14 09:10 MYT (UTC+8); independent of the earlier TerraJuke application, which our Local Lead ruled ineligible; none of its code or assets are reused.

The name and concept are the team's. See [SI.md](SI.md) for how software intelligence (AI) was used, [CREDITS.md](CREDITS.md) for NASA data credits and tools, [LIMITATIONS.md](LIMITATIONS.md) for what the app does not claim and the exact mask coordinates, and [BUILD-LOG.md](BUILD-LOG.md) for a timestamped build log.

## The visualization

NASA Scientific Visualization Studio 5313, *Change in Night Lights between 2012 and 2023 – EIC Version* (Black Marble, Suomi NPP VIIRS). Purple = more light, orange = less light, white = little change. The pinned file and its provenance (URL, route, SHA-256, byte-identity check against the Internet Archive copy) are in [public/nasa/](public/nasa/).

The same visualization's EIC movie opens with NASA's **annual night-light averages, 2012 → 2023**. TerraJuke takes those twelve frames (averaging the 5 movie frames at the centre of each year's hold, on the change map's 1024 × 288 grid) so you can hear the decade unfold. [public/nasa/decade/provenance.json](public/nasa/decade/provenance.json) records the source movie's SHA-256 and the frame numbers; [scripts/extract-decade.sh](scripts/extract-decade.sh) reproduces the frames byte for byte.

## How it works

1. The browser decodes NASA's image and reads its **own legend bar** into a ramp from −1 (orange) through 0 (white) to +1 (purple).
2. The legend, the four magnified insets (duplicates of small map boxes), their labels, box outlines and connector wedges are **masked out**.
3. Each remaining pixel is lit or unlit; lit pixels take the legend position of their colour. A 32 × 9 grid of 32-pixel cells summarizes them.
4. One **FeedbackEvent** per selection drives, at the same moment: a synthesized sound (rising pair = more light, falling pair = less light, single tone = steady; pitch = position along the legend; loudness and 1–4 pulses = lit pixel share; pan = west→east), a ring pulse on the map (a still outline under reduced motion), a visible caption, optional screen-reader text, and optional vibration on supported Android browsers.

5. **The decade.** Each yearly frame is read in the browser: a place's light is its **brightness above the dark base map** (every pixel's luma above its 7 × 7 median, summed, with no "lit" threshold; the year label is masked). **Hear the decade** plays the chosen place (or the whole map) one note per year while the map shows that year: each place starts on A3 and every doubling of its brightness is one octave up. The decade ends on NASA's change-map figure for the same place, as NASA's movie does. The year slider shows any year and plays it; while a year is shown, cells play that year.

Modes: **Explore** (pointer, touch, arrow keys, Enter/Space, Home/End for insets, D for the decade, Escape), **Tour** (the four inset regions, sounded from their map boxes, then every lit cell), **Hear the decade**, **Listen to the legend**, **Describe** (full text, per-region summaries in legend terms, the decade for each region and a cell-by-cell comparison of the two NASA renderings).

## Validation

- **Independent NASA check.** NASA's original version of this visualization (SVS 5276) publishes its annual averages as separate 12-frame series. [scripts/crosscheck-5276.ts](scripts/crosscheck-5276.ts) applies the same measure to them and writes [validation/svs5276-crosscheck.json](validation/svs5276-crosscheck.json) (with source hashes). Year by year, our EIC-derived decade tracks it with r = 0.999 for the world and r = 0.96 for India; 2023 ÷ 2012 is 1.24 vs 1.18 (world) and 1.83 for our India box vs 1.51 for NASA's wider India view. The unit tests enforce these.
- **Why no threshold.** An earlier version counted only pixels above a brightness threshold. At this coarse scale dim lights cross the threshold as they brighten, which inflated India's growth to 2.8×; the threshold-free measure agrees with the independent series at every scale tested (240–1920 px).
- **Sensitivity.** Directions for the world, India and Western Europe hold for noise floors 0.005–0.02 and dark cutoffs 0.04–0.08 (tested).
- **Limits found.** Ukraine's (280 map pixels) and the Eastern Mediterranean's (308) boxes are too small for a reliable decade reading and are flagged as weak; Western Europe dims by about 10 %, right at the threshold. Region by region and cell by cell, the app shows where NASA's two renderings agree and where they do not.

## Demo

7-slide demo deck (PDF): https://terrajuke-2026.vercel.app/TerraJuke-demo-deck.pdf (also in [public/](public/TerraJuke-demo-deck.pdf)). It was prepared with AI assistance and says so on every slide; its images are NASA SVS frames (unaltered crops) and screenshots of the live app.

## Run locally

Node 24.

```bash
npm ci
npm run dev        # http://localhost:5173
npm run check      # unit tests, typecheck + build, Playwright (Chromium + iPhone 13 WebKit)
BASE_URL=https://example.org npx playwright test   # run the browser suite against a deployed site
```

No runtime dependencies; dev dependencies are vite, typescript, @playwright/test and @axe-core/playwright.
