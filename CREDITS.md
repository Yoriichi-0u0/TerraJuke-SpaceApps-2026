# Credits

## NASA data

**Change in Night Lights between 2012 and 2023 – EIC Version** (NASA Scientific Visualization Studio, visualization 5313, released 14 June 2024).

- Producer: NASA's Scientific Visualization Studio
- Visualizer: Kel Elkins (USRA)
- Scientists: Zhuosen Wang (UMD), Miguel Román (Leidos), Ranjay Shrestha (SSAI), Srija Chakraborty (USRA), Virginia Kalb (NASA)
- Dataset: Black Marble (Next Generation), Suomi NPP VIIRS, NASA/NOAA
- Page: https://svs.gsfc.nasa.gov/5313
- File used: `nightlights_flat_series_and_change_wZooms_13_EIC.02599_print.jpg` (1024×288, 63,503 bytes)

The EIC version is formatted for the Earth Information Center's wide displays; the original visualization is SVS 5276.

## Tools and packages

| Tool | Use | Licence |
|---|---|---|
| [Vite](https://vite.dev) 8 | Dev server and build | MIT |
| [TypeScript](https://www.typescriptlang.org) 7 | Language and typecheck | Apache-2.0 |
| [Playwright](https://playwright.dev) (@playwright/test 1.65) | Browser tests (Chromium, WebKit) | Apache-2.0 |
| [axe-core](https://github.com/dequelabs/axe-core) via @axe-core/playwright 4.14 | Accessibility checks | MPL-2.0 |
| Node.js 24 (`node --test`) | Unit tests | MIT |
| Web Audio API | Live sound synthesis (browser built-in) | — |
| OKLab colour space (Björn Ottosson, 2020) | Perceptual colour matching (formulas re-implemented) | public formulas |
| Claude Code (Anthropic) | SI coding agent; see SI.md | — |
| GitHub, Vercel | Source hosting and static hosting | — |
| macOS `sips` | One-time JPEG→BMP decode of the test fixture | — |

No runtime dependencies are shipped to the browser.
