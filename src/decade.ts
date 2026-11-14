// The decade: NASA SVS 5313's own annual night-light frames, 2012–2023.
//
// The EIC movie opens with one annual-average frame per year before it reveals the change
// map. scripts/extract-decade.sh takes each year's frame from the movie at the change map's
// 1024 × 288 grid (see public/nasa/decade/provenance.json). Here we read RENDERED pixels:
// how many map pixels are lit and how far they stand above the dark base map around them.
// That is rendered brightness, not radiance, and a share of pixels, not of area.
import { localMedianLuma } from './analyze.ts';
import { luma } from './color.ts';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from './layout.ts';
import { inRect, rgbAt, type Raster, type Rect } from './raster.ts';
import type { Direction } from './analyze.ts';
import { gainFor, panFor, type NotePlan } from './sonify.ts';

export const YEARS = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023] as const;
export type Year = (typeof YEARS)[number];
export const frameUrl = (year: number) => `/nasa/decade/${year}.jpg`;

/** NASA prints the year near the middle of the map (detected on all 12 frames; see the tests). */
export const YEAR_LABEL: Rect = { x0: 531, y0: 144, x1: 553, y1: 151 };
export const YEAR_LABEL_PAD = 4;

/** A pixel is lit when it is at least this bright … (the dark land base map stays below it) */
export const DECADE_LIT_LUMA = 0.15;
/** … and stands at least this far above the 7 × 7 median luma around it. */
export const DECADE_CONTRAST = 0.03;

/** Light per pixel: luma above the local base for lit pixels, 0 for unlit or masked pixels. */
export interface YearField {
  readonly year: number;
  readonly light: Float32Array;
}

export function isYearLabel(x: number, y: number): boolean {
  return inRect(YEAR_LABEL, x, y, YEAR_LABEL_PAD);
}

export function analyzeYear(r: Raster, year: number): YearField {
  const light = new Float32Array(r.width * r.height);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (isYearLabel(x, y)) continue;
      const L = luma(rgbAt(r, x, y));
      if (L < DECADE_LIT_LUMA) continue;
      const excess = L - localMedianLuma(r, x, y);
      if (excess >= DECADE_CONTRAST) light[y * r.width + x] = excess;
    }
  }
  return { year, light };
}

export interface YearStats {
  readonly year: number;
  /** Map pixels considered (the year label is excluded). */
  readonly mapPixels: number;
  readonly litPixels: number;
  /** litPixels / mapPixels: a share of rendered map pixels, not of land area. */
  readonly litFraction: number;
  /** Sum of each lit pixel's luma above its local base: rendered brightness, not radiance. */
  readonly light: number;
}

export function yearStats(field: YearField, rect: Rect): YearStats {
  let mapPixels = 0;
  let litPixels = 0;
  let light = 0;
  for (let y = Math.max(0, rect.y0); y <= Math.min(IMAGE_HEIGHT - 1, rect.y1); y++) {
    for (let x = Math.max(0, rect.x0); x <= Math.min(IMAGE_WIDTH - 1, rect.x1); x++) {
      if (isYearLabel(x, y)) continue;
      mapPixels++;
      const v = field.light[y * IMAGE_WIDTH + x];
      if (v > 0) {
        litPixels++;
        light += v;
      }
    }
  }
  return { year: field.year, mapPixels, litPixels, litFraction: mapPixels ? litPixels / mapPixels : 0, light };
}

export function decadeSeries(fields: readonly YearField[], rect: Rect): YearStats[] {
  return fields.map((f) => yearStats(f, rect));
}

/** Year-on-year change above this share counts as more / less light for that step. */
export const YEAR_CHANGE = 0.05;
/** 2023 against 2012: a change above this share is a decade trend of more / less light. */
export const DECADE_CHANGE = 0.1;

function compare(before: number, after: number, threshold: number): Direction {
  if (before === 0) return after > 0 ? 'more' : 'steady';
  const r = after / before - 1;
  if (r > threshold) return 'more';
  if (r < -threshold) return 'less';
  return 'steady';
}

/** Direction of one year against the previous year (the first year is 'steady'). */
export function yearDirection(prev: YearStats | undefined, cur: YearStats): Direction {
  return prev ? compare(prev.light, cur.light, YEAR_CHANGE) : 'steady';
}

/** Direction of the whole decade (first year against last), or null when nothing is ever lit. */
export function decadeTrend(series: readonly YearStats[]): Direction | null {
  const first = series[0];
  const last = series[series.length - 1];
  if (!series.some((s) => s.litPixels > 0)) return null;
  return compare(first.light, last.light, DECADE_CHANGE);
}

// ---- Sound rules for the decade ------------------------------------------------
// Each place starts on the same note (A3) in its first lit year. Every doubling of its
// rendered light moves the melody up one octave (5 steps of the pentatonic scale); every
// halving, one octave down. So the melody is the place's own trend, comparable everywhere:
// "an octave up" always means "twice the rendered light of the starting year".
// Loudness follows the lit share of map pixels, exactly as in the change map.

/** A major pentatonic scale over three octaves from A2 (110 Hz), in semitones. */
export const DECADE_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36] as const;
export const DECADE_BASE_HZ = 110;
/** Starting note (A3) and how many scale steps one doubling of light moves. */
export const DECADE_START_STEP = 5;
export const STEPS_PER_DOUBLING = 5;
export const YEAR_NOTE_SECONDS = 0.34;
export const YEAR_STEP_MS = 500;

/** Scale step for a year's light against the place's starting light, or null if unlit. */
export function decadeStep(light: number, startLight: number): number | null {
  if (light <= 0 || startLight <= 0) return null;
  const step = DECADE_START_STEP + Math.round(STEPS_PER_DOUBLING * Math.log2(light / startLight));
  return Math.max(0, Math.min(DECADE_SCALE.length - 1, step));
}

export const stepHz = (step: number) => DECADE_BASE_HZ * 2 ** (DECADE_SCALE[step] / 12);

/** The starting light: the first year in which the place has any lit pixels. */
export function startLight(series: readonly YearStats[]): number {
  return series.find((s) => s.light > 0)?.light ?? 0;
}

/** One soft note for one year, or null for a year with no lit pixels (a rest). */
export function yearPlan(cur: YearStats, start: number, direction: Direction, xCentre: number): NotePlan | null {
  const step = decadeStep(cur.light, start);
  if (step === null) return null;
  return {
    direction,
    figure: 'single',
    waveform: 'triangle',
    step,
    pulses: 1,
    gain: gainFor(cur.litFraction),
    pan: panFor(xCentre, IMAGE_WIDTH),
    notes: [{ at: 0, duration: YEAR_NOTE_SECONDS, hz: stepHz(step) }],
  };
}

export const DECADE_MAPPING_TABLE = [
  ['NASA’s annual frame for each year, 2012 → 2023', 'One note per year, half a second apart, while the map shows that year'],
  ['Rendered light of the place against its first lit year', 'Pitch: starts on A3; twice the light = one octave higher, half = one octave lower (A major pentatonic, A2–A5)'],
  ['Share of the place’s map pixels that are lit', 'Loudness (25–100 %, full at 10 %)'],
  ['A year with no lit pixels', 'A rest (silence)'],
  ['Brighter / dimmer / similar to the year before (±5 %)', 'Purple / orange / white ring, and the matching vibration'],
  ['After 2023: NASA’s change map for the same place', 'The change-map figure: rising pair, falling pair or single tone'],
] as const;
