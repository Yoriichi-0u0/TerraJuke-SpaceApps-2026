# How TerraJuke works (draft)

1. **One NASA image, pinned.** NASA SVS 5313 *Change in Night Lights between 2012 and 2023 – EIC Version* (1024 × 288 JPEG). We downloaded it from NASA and checked it byte for byte against an Internet Archive copy (SHA-256 identical).
2. **Read NASA's own legend.** The browser decodes the image and reads the legend bar inside it into a ramp: −1 at the orange end (less light), 0 at the whitest point (no change), +1 at the purple end (more light).
3. **Mask everything that is not map.** The legend, the four magnified insets and their labels, the small boxes they magnify, and the connector wedges are excluded. Their coordinates were detected programmatically on the pinned file, frozen, and re-checked by tests. The insets are magnified copies, so they are never counted twice: selecting an inset plays its box on the map.
4. **Find the lights.** A pixel is lit when it is bright, or when a dimmer coloured dot stands out from the grey land around it. Each lit pixel takes the legend position of its colour (lightness-normalised OKLab), so dim dots keep their hue.
5. **Cells.** The map is a 32 × 9 grid of 32-pixel cells. For each cell: the share of map pixels lit, the luma-weighted mean legend position, and the shares on the purple side, the orange side and near white.
6. **Fixed sound rules (Web Audio, synthesized live):**

   | Image | Sound |
   |---|---|
   | More light (mean position > +0.15) | Rising pair (up a major third), bright filtered sawtooth |
   | Less light (< −0.15) | Falling pair (down a minor third), mellow triangle |
   | Lit, near white | Single soft sine |
   | Distance along the legend | Starting pitch on a two-octave A major pentatonic scale |
   | Lit pixel share | Loudness and 1–4 pulses |
   | West → east | Stereo pan |
   | Unlit or masked | Silence |

7. **One event, every sense.** Each sound is a single FeedbackEvent that, at the same moment, plays the notes, pulses a ring on the map (a still outline for reduced motion), writes a caption, optionally announces it to screen readers (Off / On selection / Summary every 5 s; never a flood), and optionally vibrates on supported Android browsers.
8. **Tested.** 24 unit tests on the pinned file (masks, legend, classification, sound rules) and 15 browser tests run in Chromium and iPhone 13 WebKit emulation, locally and against the live site: rising for purple, falling for orange, silence for masked and unlit cells, synchronized pulse and text, keyboard-only use, Stop, vibration only when enabled, reduced motion, and zero axe accessibility violations.

**Benefits.** Blind and low-vision visitors explore the map by ear and keyboard, with a full description. Deaf and hard-of-hearing visitors see every sound as a pulse and a caption. Everyone can learn the legend by ear and hear the contrast between, for example, India's map box (mostly purple: more light) and Western Europe's (mostly orange: less light).

**Limits.** Rendered colours, not radiance; a share of map pixels, not area (equirectangular map); some longitudes appear twice in the wide EIC layout; very dim lights can fall below the threshold; Ukraine's small map box holds very few lit pixels at this resolution, and the app says so.
