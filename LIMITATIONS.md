# Limitations and mask coordinates

## What TerraJuke does and does not claim

- NASA SVS 5313 colours each lit place by the **direction** of night-light change from 2012 to 2023: purple = more light, orange = less light, white = about the same. TerraJuke reads those **rendered colours**. It does not read radiance, and it never reports an exact amount of light.
- A "strength" cue (slightly / clearly / strongly) says **how far the rendered colour sits along NASA's legend bar**, e.g. "strongly purple on the legend". It is not a measured magnitude.
- It does not measure or infer urbanization, population, economic activity, energy use or any cause of change.
- "Lit share" is the share of **map pixels** in a 32 × 32-pixel cell that are lit. The map is equirectangular, so a pixel near the poles covers much less ground than one at the equator. This is not a share of geographic area.
- The wide Earth Information Center layout repeats some longitudes, so some places appear twice on the map (for example, Europe and North America).
- The file is 1024 × 288 pixels. Very dim lights, especially near-white ones on grey land, can fall below the lit threshold. The Ukraine box on the world map holds very few lit pixels at this scale, so its reading is weak and the app says so.
- Colours come from a JPEG; compression noise shifts some pixels slightly. Browsers decode the JPEG themselves, and the analysis runs on the decoded pixels in the visitor's browser.

## How a pixel is classified (src/analyze.ts)

1. Masked pixels (below) are ignored.
2. Lit if luma ≥ 0.30, or if luma ≥ max(7 × 7 median luma, 0.14) + 0.04 **and** OKLab chroma ≥ 0.018 (neutral grey land, ice and Antarctica are excluded).
3. A lit pixel takes the position s ∈ [−1, +1] of the nearest legend sample by lightness-normalised OKLab chromaticity (a/L, b/L). The legend samples are read from the image's own bar (x 504–579, rows 162–165 averaged); s = 0 at the whitest sample (x = 542), −1 at the orange end, +1 at the purple end.
4. A cell's direction is its luma-weighted mean s: "more" above +0.15, "less" below −0.15, otherwise "steady".

## Masks (src/layout.ts)

All rectangles are inclusive image pixel coordinates in the 1024 × 288 file. They were detected programmatically (src/layout-detect.ts: strongest grey line within ±6 px of rough seeds for frames, ±4 px for parent boxes; the legend from its bright colour run) and then frozen. Unit tests re-run the detection on the pinned file and require agreement within 1 px.

| Area | Rectangle (x0, y0 – x1, y1) | Treatment |
|---|---|---|
| Legend (title, bar, tick labels) | 501, 157 – 582, 170 (+3 px pad) | masked |
| Legend colour bar | 502, 162 – 581, 165 | source of the legend ramp only |
| Western Europe inset frame | 91, 99 – 265, 274 (+3 px pad) | masked (magnified duplicate) |
| Western Europe parent box | 223, 52 – 258, 87 | outline ±3 px masked; interior 226, 55 – 255, 84 is map data |
| Eastern Mediterranean inset frame | 315, 17 – 429, 169 (+3 px pad) | masked |
| Eastern Mediterranean parent box | 278, 79 – 297, 106 | outline masked; interior 281, 82 – 294, 103 |
| Ukraine inset frame | 619, 13 – 763, 122 (+3 px pad) | masked |
| Ukraine parent box | 784, 55 – 809, 74 | outline masked; interior 787, 58 – 806, 71 |
| India inset frame | 807, 142 – 944, 279 (+3 px pad) | masked |
| India parent box | 844, 91 – 884, 132 | outline masked; interior 847, 94 – 881, 129 |
| Connector wedges | quadrilateral joining the facing edges of each parent box and its frame (+3 px) | masked |

Inset labels sit inside the frames and are masked with them. The insets are **magnified duplicates** of their parent boxes: they are never counted or sonified as observations. Selecting an inset, or touring it, plays the parent box's map pixels and shows the inset only as a view.
