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

## The decade (src/decade.ts)

- The twelve yearly frames are NASA's **annual night-light averages as rendered in the SVS 5313 EIC movie** (H.265 video, 7680 × 2160), not the underlying Black Marble data. Each is the per-channel average of the 5 movie frames at the centre of that year's hold, scaled 7.5× down to the change map's 1024 × 288 grid. Compression noise remains.
- **Measure.** A place's light is its brightness above the base map: for every pixel, luma minus the 7 × 7 median around it, kept when above 0.01 (noise floor), summed. Pixels darker than 0.06 are skipped (they cannot stand above the base map). There is **no lit threshold**, because a threshold exaggerates growth at this scale (dim lights cross it as they brighten). It is rendered brightness, not radiance, and NASA's display rendering need not be linear. A separate "clearly bright" count (luma ≥ 0.15 and ≥ 0.03 above the base) sets loudness only.
- NASA prints the year near the middle of every frame. It is masked: rectangle 531, 144 – 553, 151 (+4 px pad), detected on all twelve frames by the unit tests.
- Pitch is relative to each place's first year (A3); one octave = twice that year's brightness. Year-on-year changes within ±5 % count as "similar"; the decade trend (2023 against 2012) uses ±10 %.
- **Independent check (validation/svs5276-crosscheck.json).** NASA SVS 5276 publishes the same annual averages as separate 12-frame series (world 7680 × 4320; India and Ukraine views 3840 × 2160; frame order confirmed against NASA's year-named 2012 and 2023 stills). With the same measure: world 2023 ÷ 2012 = 1.18 (ours 1.24, year-by-year r = 0.999); India view 1.51 (our India box 1.83, r = 0.96; the areas differ: NASA's view includes all of South Asia). Ukraine's view (which includes neighbouring countries) gives r = 0.41 against our tiny Ukraine box: no reliable comparison.
- **Results at this scale.** World 1.24×, India 1.83×, Western Europe 0.89× (about −10 %, right at the threshold; it reads "steady" with a lower dark cutoff). Ukraine's box (280 map pixels) and the Eastern Mediterranean's (308) are below 600 map pixels and are flagged as **weak readings**; both read brighter while the change map shows less light and little change.
- **Two NASA renderings compared.** Cell by cell, where both show light and the change map is at least half unmasked (24 cells): 13 agree on the direction, 7 differ only between "little change" and a direction, 4 point in opposite directions. The unit tests pin these numbers; the app recomputes and shows them in Describe, with a region-by-region table.
- An earlier version of this mode (commit abf8808) used a lit threshold and reported India at 4.3× and Ukraine's box going dark in 2022; both were threshold artifacts of the coarse scale and were corrected after the independent check.
