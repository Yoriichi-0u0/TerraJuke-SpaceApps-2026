// Modes (Explore, Tour, Listen to the legend, Describe), keyboard and pointer handling.
import { cellRect, COLS, ROWS, directionOf, type Cell, type InsetSummary, type RegionStats } from './analyze.ts';
import { AudioEngine } from './audio.ts';
import { cellPosition, decadeSentence, directionWords, eventCaption, insetSentence, pct, statsSentence, trendWords, VISUAL_DESCRIPTION, yearCaption } from './describe.ts';
import crosscheck from '../validation/svs5276-crosscheck.json';
import {
  DECADE_MAPPING_TABLE,
  SMALL_PLACE_PIXELS,
  decadeSeries,
  decadeTrend,
  frameUrl,
  startLight,
  YEAR_STEP_MS,
  yearDirection,
  yearPlan,
  YEARS,
  type YearField,
  type YearStats,
} from './decade.ts';
import { Announcer, Feedback, vibrationSupported, type Announcements } from './feedback.ts';
import { IMAGE_HEIGHT, IMAGE_WIDTH, INSETS, LEGEND_BAR, maskReason } from './layout.ts';
import type { RampSample } from './legend.ts';
import type { Rect } from './raster.ts';
import { EVENT_SECONDS, legendTourPositions, MAPPING_TABLE, planFor } from './sonify.ts';

export interface Model {
  readonly cells: readonly Cell[];
  readonly insets: readonly InsetSummary[];
  readonly ramp: readonly RampSample[];
  readonly overall: RegionStats;
}

declare global {
  interface Window {
    /** Diagnostics: the audio context's state, and a way for tests to suspend it. */
    terrajukeAudio?: { state(): string; suspend(): Promise<void> };
    terrajukeDecade?: {
      regions: { id: string; trend: string | null; change: string | null; ratio: number; small: boolean; light: number[] }[];
      agreement: { same: number; nearly: number; opposite: number };
    };
    terrajukeModel?: {
      cells: { col: number; row: number; direction: string | null; litPixels: number; maskedFraction: number; meanChange: number }[];
      insets: { id: string; direction: string | null; litPixels: number }[];
    };
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const TOUR_STEP_MS = 1300;
const FULL_MAP: Rect = { x0: 0, y0: 0, x1: IMAGE_WIDTH - 1, y1: IMAGE_HEIGHT - 1 };
/** The year slider's last position: NASA's change map, as at the end of NASA's movie. */
const CHANGE_POSITION = 2024;
const CHANGE_TEXT = 'Change map, 2012 to 2023';

/** The place the decade and the year slider play: the last cell or region chosen, or the whole map. */
interface Place {
  readonly label: string;
  readonly rect: Rect;
  /** The same place on NASA's change map (null where the change map covers it with graphics). */
  readonly change: RegionStats | null;
}

export interface UI {
  enableDecade(fields: readonly YearField[]): void;
}
const LEGEND_STEP_MS = 1000;

function placeBox(el: HTMLElement, r: Rect): void {
  el.hidden = false;
  el.style.left = `${(r.x0 / IMAGE_WIDTH) * 100}%`;
  el.style.top = `${(r.y0 / IMAGE_HEIGHT) * 100}%`;
  el.style.width = `${((r.x1 - r.x0 + 1) / IMAGE_WIDTH) * 100}%`;
  el.style.height = `${((r.y1 - r.y0 + 1) / IMAGE_HEIGHT) * 100}%`;
}

export function startUI(model: Model): UI {
  const map = $('explorer');
  const focusBox = $('focus-box');
  const insetView = $('inset-view');
  const caption = $('caption');
  const status = $('status');
  const announcer = new Announcer($('announcer'));
  const audio = new AudioEngine();
  const soundStatus = $('sound-status');
  const SOUND_WORDS: Record<string, string> = {
    running: 'Sound: on.',
    suspended: 'Sound: waiting for the browser. Tap, click or press a key to allow sound; captions and pulses still work.',
    interrupted: 'Sound: paused by the device (for example a call). Tap or press a key to resume.',
    closed: 'Sound: stopped.',
    unavailable: 'Sound: not available in this browser. Captions, pulses, text and vibration still work.',
  };
  let warnedBlocked = false;
  const showSound = (state: string) => {
    soundStatus.textContent = SOUND_WORDS[state] ?? 'Sound: starts when you choose something.';
    if (state === 'running') warnedBlocked = false;
  };
  audio.onStateChange = showSound;
  if (!audio.available) showSound('unavailable');
  // WebKit grants permission to start audio on pointerup/touchend/click/keydown, not always on
  // pointerdown. Resume an existing context on every such gesture, so the first tap on a phone
  // is never silent. (A context is only created by actions that play sound.)
  for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) {
    document.addEventListener(type, () => audio.resume(), { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') audio.resume();
  });
  window.terrajukeAudio = { state: () => audio.state, suspend: () => audio.suspendForTest() };
  const feedback = new Feedback({ audio, pulseLayer: $('pulse-layer'), caption, announcer });
  feedback.onBlocked = () => {
    // Said once: a screen-reader user must know why nothing is heard.
    if (warnedBlocked) return;
    warnedBlocked = true;
    announcer.say(SOUND_WORDS[audio.state] ?? SOUND_WORDS.suspended);
  };
  const buttons = { explore: $('btn-explore'), tour: $('btn-tour'), legend: $('btn-legend'), decade: $<HTMLButtonElement>('btn-decade') };
  const yearImg = $<HTMLImageElement>('year-image');
  const yearBadge = $('year-badge');
  const yearSlider = $<HTMLInputElement>('year');
  const yearOut = $('year-out');
  const changeMapBtn = $<HTMLButtonElement>('btn-change-map');
  const WORLD: Place = { label: 'The whole map', rect: FULL_MAP, change: model.overall };
  let place: Place = WORLD;
  let decade: readonly YearField[] | null = null;
  /** The NASA yearly frame on show, or null when the change map is shown. */
  let shownYear: number | null = null;

  let focus = { col: 8, row: 3 };
  let insetIndex = -1;
  let timer: number | undefined;
  let mode: 'explore' | 'tour' | 'legend' | 'decade' = 'explore';
  let lastHover = '';
  let hoverArmed = false;

  window.terrajukeModel = {
    cells: model.cells.map((c) => ({ col: c.col, row: c.row, direction: c.direction, litPixels: c.litPixels, maskedFraction: c.maskedFraction, meanChange: c.meanChange })),
    insets: model.insets.map((i) => ({ id: i.id, direction: i.direction, litPixels: i.litPixels })),
  };

  // ---- Static content ----------------------------------------------------------
  $('visual-description').textContent = VISUAL_DESCRIPTION;
  const o = model.overall;
  $('overall-summary').textContent =
    `Outside the legend, insets, outlines and connector wedges, ${pct(o.litFraction)} of the map’s ${o.mapPixels.toLocaleString('en')} pixels are lit (${o.litPixels.toLocaleString('en')} pixels). ` +
    `Of those, ${pct(o.shareMore)} sit on the purple side of NASA’s legend (more light), ${pct(o.shareLess)} on the orange side (less light) and ${pct(o.shareSteady)} near white. ` +
    `${model.cells.filter((c) => c.direction).length} of the ${COLS * ROWS} cells contain lit map pixels. These are shares of rendered pixels, not of land area.`;
  $('inset-summaries').replaceChildren(
    ...model.insets.map((s) => {
      const li = document.createElement('li');
      li.textContent = insetSentence(s);
      return li;
    }),
  );
  $('mapping-table')
    .querySelector('tbody')!
    .replaceChildren(
      ...MAPPING_TABLE.map(([a, b]) => {
        const tr = document.createElement('tr');
        for (const t of [a, b]) {
          const td = document.createElement('td');
          td.textContent = t;
          tr.append(td);
        }
        return tr;
      }),
    );

  const vibrateWrap = $('vibrate-wrap');
  const vibrateBox = $<HTMLInputElement>('vibrate');
  if (vibrationSupported()) {
    vibrateWrap.hidden = false;
    vibrateBox.addEventListener('change', () => {
      feedback.vibration = vibrateBox.checked;
      announcer.say(vibrateBox.checked ? 'Tactile feedback on.' : 'Tactile feedback off.');
    });
  }
  $<HTMLSelectElement>('announce').addEventListener('change', (e) => {
    feedback.setAnnouncements((e.target as HTMLSelectElement).value as Announcements);
  });

  // ---- Helpers -----------------------------------------------------------------
  const cellAt = (col: number, row: number) => model.cells[row * COLS + col];
  const centreX = (r: Rect) => (r.x0 + r.x1) / 2;

  function insetUnder(cell: Cell) {
    const cx = (cell.rect.x0 + cell.rect.x1) >> 1;
    const cy = (cell.rect.y0 + cell.rect.y1) >> 1;
    return INSETS.findIndex((i) => cx >= i.frame.x0 && cx <= i.frame.x1 && cy >= i.frame.y0 && cy <= i.frame.y1);
  }

  function describeCell(cell: Cell): string {
    const where = cellPosition(cell);
    if (cell.mapPixels === 0) {
      const idx = insetUnder(cell);
      if (idx >= 0) return `${where}: ${INSETS[idx].name} inset, a magnified copy of a box on the map. Press Enter to hear that box.`;
      const reason = maskReason((cell.rect.x0 + cell.rect.x1) >> 1, (cell.rect.y0 + cell.rect.y1) >> 1);
      return `${where}: ${reason === 'legend' ? 'the legend. Use Listen to the legend' : 'masked graphics, not map data'}.`;
    }
    const partly = cell.maskedFraction > 0.05 ? ` (${pct(cell.maskedFraction)} of the cell is covered by graphics and ignored)` : '';
    return `${where}: ${statsSentence(cell)}${partly}.`;
  }

  function describeYearCell(cell: Cell, year: number): string {
    const s = decadeSeries(decade!, cellRect(cell.col, cell.row))[YEARS.indexOf(year as (typeof YEARS)[number])];
    return `${cellPosition(cell)}, ${year} frame: ${s.light > 0 ? `${s.litPixels} clearly bright pixel${s.litPixels === 1 ? '' : 's'}, brightness above the base map ${s.light.toFixed(2)}` : 'nothing brighter than the base map'}.`;
  }

  function showFocus(): void {
    placeBox(focusBox, cellAt(focus.col, focus.row).rect);
    keepVisible();
  }

  /** On narrow screens the map scrolls sideways: keep the focus box in view. */
  function keepVisible(): void {
    const scroller = map.parentElement!;
    const box = focusBox.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    if (box.left < view.left || box.right > view.right) {
      scroller.scrollLeft += box.left - view.left - (view.width - box.width) / 2;
    }
  }

  function playCell(cell: Cell, origin: 'user' | 'auto'): void {
    insetView.hidden = true;
    if (shownYear !== null && decade) {
      // A yearly frame is on show: play that year for this cell (the frames have no insets).
      place = { label: cellPosition(cell), rect: cell.rect, change: cell.mapPixels ? cell : null };
      playYearOf(place, shownYear, origin);
      return;
    }
    if (cell.mapPixels === 0) {
      const idx = insetUnder(cell);
      if (idx >= 0) return playInset(idx, origin);
      caption.textContent = `${cellPosition(cell)}: ${maskReason((cell.rect.x0 + cell.rect.x1) >> 1, (cell.rect.y0 + cell.rect.y1) >> 1) === 'legend' ? 'legend area' : 'masked graphics'} · silent`;
      return;
    }
    place = { label: cellPosition(cell), rect: cell.rect, change: cell };
    const plan = planFor(cell, centreX(cell.rect), IMAGE_WIDTH);
    if (!plan) {
      caption.textContent = `${cellPosition(cell)} · no lit map pixels · silent`;
      return;
    }
    feedback.emit({
      id: feedback.newId(),
      source: 'cell',
      origin,
      rect: cell.rect,
      direction: plan.direction,
      magnitude: Math.abs(cell.meanChange),
      litFraction: cell.litFraction,
      plan,
      text: eventCaption(cellPosition(cell), cell, plan),
    });
  }

  function playInset(idx: number, origin: 'user' | 'auto'): void {
    insetIndex = idx;
    const s = model.insets[idx];
    place = { label: `${s.name} map region`, rect: s.region, change: s };
    placeBox(insetView, INSETS[idx].frame);
    placeBox(focusBox, s.region);
    keepVisible();
    const plan = planFor(s, centreX(s.region), IMAGE_WIDTH);
    if (!plan) {
      caption.textContent = `${s.name} map region · no lit map pixels · silent`;
      return;
    }
    feedback.emit({
      id: feedback.newId(),
      source: 'region',
      origin,
      rect: s.region,
      direction: plan.direction,
      magnitude: Math.abs(s.meanChange),
      litFraction: s.litFraction,
      plan,
      text: eventCaption(`${s.name} map region (inset shown)`, s, plan),
    });
  }

  function setMode(next: typeof mode): void {
    mode = next;
    buttons.explore.setAttribute('aria-pressed', String(next === 'explore'));
    buttons.tour.setAttribute('aria-pressed', String(next === 'tour'));
    buttons.legend.setAttribute('aria-pressed', String(next === 'legend'));
    buttons.decade.setAttribute('aria-pressed', String(next === 'decade'));
  }

  function stopAll(announce = true): void {
    const wasRunning = mode !== 'explore' || audio.activeVoices > 0;
    window.clearTimeout(timer);
    timer = undefined;
    feedback.stop();
    insetView.hidden = true;
    showYear(null);
    setMode('explore');
    if (announce && wasRunning) announcer.say('Stopped.');
    caption.textContent = 'Stopped.';
  }

  // ---- Tour --------------------------------------------------------------------
  function startTour(): void {
    stopAll(false);
    audio.unlock();
    setMode('tour');
    const litCells = model.cells.filter((c) => c.direction);
    const steps: (() => void)[] = [
      ...INSETS.map((_, i) => () => playInset(i, 'auto')),
      ...litCells.map((c) => () => {
        insetView.hidden = true;
        focus = { col: c.col, row: c.row };
        showFocus();
        playCell(c, 'auto');
      }),
    ];
    announcer.say(`Tour started: the four inset regions, then ${litCells.length} lit cells row by row. Press Escape or Stop to end.`);
    let i = 0;
    const next = () => {
      if (mode !== 'tour') return;
      if (i >= steps.length) {
        setMode('explore');
        announcer.say('Tour finished.');
        return;
      }
      timer = window.setTimeout(next, TOUR_STEP_MS);
      steps[i++]();
    };
    timer = window.setTimeout(next, 400);
  }

  // ---- Legend ------------------------------------------------------------------
  function startLegend(): void {
    stopAll(false);
    audio.unlock();
    setMode('legend');
    announcer.say('Playing the legend from orange, less light, through white, to purple, more light.');
    const positions = legendTourPositions();
    const xFor = (s: number) => {
      let best = model.ramp[0];
      for (const r of model.ramp) if (Math.abs(r.s - s) < Math.abs(best.s - s)) best = r;
      return best.x;
    };
    let i = 0;
    const next = () => {
      if (mode !== 'legend') return;
      if (i >= positions.length) {
        setMode('explore');
        insetView.hidden = true;
        announcer.say('Legend finished.');
        return;
      }
      timer = window.setTimeout(next, LEGEND_STEP_MS);
      const s = positions[i++];
      const x = xFor(s);
      const direction = directionOf(s);
      const stats = { direction, meanChange: s, litFraction: 0.05 };
      const rect = { x0: x - 2, x1: x + 2, y0: LEGEND_BAR.y0, y1: LEGEND_BAR.y1 };
      const plan = planFor(stats, x, IMAGE_WIDTH)!;
      placeBox(focusBox, rect);
      const colour = s < -0.15 ? 'orange side' : s > 0.15 ? 'purple side' : 'white middle';
      feedback.emit({
        id: feedback.newId(),
        source: 'legend',
        origin: 'auto',
        rect,
        direction,
        magnitude: Math.abs(s),
        litFraction: 0.05,
        plan,
        text: `Legend position ${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(2)} · ${colour} · ${directionWords(direction)} · ${plan.figure === 'single' ? 'single tone' : plan.figure}, pitch step ${plan.step}`,
      });
    };
    next();
  }

  // ---- The decade ----------------------------------------------------------------
  function showYear(year: number | null): void {
    shownYear = year;
    if (year === null) {
      yearImg.hidden = true;
      yearBadge.hidden = true;
      yearOut.textContent = 'Change map shown';
      yearSlider.value = String(CHANGE_POSITION);
      yearSlider.setAttribute('aria-valuetext', CHANGE_TEXT);
      return;
    }
    yearImg.src = frameUrl(year);
    yearImg.alt = `NASA’s annual night-light average for ${year}, shown over the change map.`;
    yearImg.hidden = false;
    yearBadge.textContent = String(year);
    yearBadge.hidden = false;
    yearSlider.value = String(year);
    yearSlider.setAttribute('aria-valuetext', String(year));
    yearOut.textContent = `${year} frame shown`;
  }

  function seriesFor(p: Place): YearStats[] {
    return decadeSeries(decade!, p.rect);
  }

  /** One year of the decade for a place, through every channel at once. */
  function emitYear(p: Place, series: readonly YearStats[], i: number, origin: 'user' | 'auto'): void {
    const cur = series[i];
    const prev = i > 0 ? series[i - 1] : undefined;
    const dir = yearDirection(prev, cur);
    const first = series.find((s) => s.light > 0);
    const text = yearCaption(p.label, cur, first, dir, prev ? prev.year : null);
    const plan = yearPlan(cur, startLight(series), dir, centreX(p.rect));
    if (!plan) {
      caption.textContent = text;
      if (origin === 'user') announcer.say(text);
      return;
    }
    feedback.emit({ id: feedback.newId(), source: 'year', origin, rect: p.rect, direction: dir, magnitude: 0, litFraction: cur.litFraction, plan, text });
  }

  function playYearOf(p: Place, year: number, origin: 'user' | 'auto'): void {
    if (p !== WORLD) placeBox(focusBox, p.rect);
    const series = seriesFor(p);
    emitYear(p, series, YEARS.indexOf(year as (typeof YEARS)[number]), origin);
  }

  /** NASA's change map for the same place: the cadence at the end of the decade. */
  function playChangeOf(p: Place): void {
    const s = p.change;
    const plan = s && s.direction ? planFor(s, centreX(p.rect), IMAGE_WIDTH) : null;
    if (!s || !plan) {
      caption.textContent = `NASA’s change map · ${p.label} · ${s ? 'no lit map pixels' : 'covered by graphics on the change map'} · silent`;
      return;
    }
    feedback.emit({
      id: feedback.newId(),
      source: p === WORLD ? 'region' : 'cell',
      origin: 'auto',
      rect: p.rect,
      direction: plan.direction,
      magnitude: Math.abs(s.meanChange),
      litFraction: s.litFraction,
      plan,
      text: eventCaption(`NASA’s change map · ${p.label}`, s, plan),
    });
  }

  function startDecade(): void {
    if (!decade) return;
    const p = place;
    stopAll(false);
    audio.unlock();
    setMode('decade');
    if (p !== WORLD) placeBox(focusBox, p.rect);
    const series = seriesFor(p);
    const trend = decadeTrend(series);
    announcer.say(`The decade for ${p.label}: NASA’s yearly frames from 2012 to 2023, one note each, then NASA’s change map. Press Escape or Stop to end.`);
    let i = 0;
    const next = () => {
      if (mode !== 'decade') return;
      if (i < series.length) {
        showYear(series[i].year);
        emitYear(p, series, i, 'auto');
        i++;
        timer = window.setTimeout(next, YEAR_STEP_MS);
      } else if (i === series.length) {
        showYear(null);
        playChangeOf(p);
        i++;
        timer = window.setTimeout(next, TOUR_STEP_MS);
      } else {
        setMode('explore');
        announcer.say(decadeSentence(p.label, series, trend, p.change?.direction ?? null, series[0].mapPixels < SMALL_PLACE_PIXELS));
      }
    };
    timer = window.setTimeout(next, 250);
  }

  function enableDecade(fields: readonly YearField[]): void {
    decade = fields;
    buttons.decade.disabled = false;
    buttons.decade.removeAttribute('title');
    yearSlider.disabled = false;
    changeMapBtn.disabled = false;
    yearSlider.setAttribute('aria-valuetext', CHANGE_TEXT);
    for (const y of YEARS) new Image().src = frameUrl(y);

    const places: { id: string; label: string; rect: Rect; change: RegionStats }[] = [
      { id: 'world', label: 'The whole map', rect: FULL_MAP, change: model.overall },
      ...model.insets.map((s) => ({ id: s.id, label: `${s.name} map region`, rect: s.region, change: s as RegionStats })),
    ];
    const rows = places.map((pl) => {
      const series = decadeSeries(fields, pl.rect);
      return { ...pl, series, trend: decadeTrend(series) };
    });
    $('decade-intro').textContent =
      'NASA’s movie for this visualization opens with an annual night-light average for every year from 2012 to 2023. TerraJuke reads each yearly frame in your browser on the same grid as the change map and measures each place’s brightness above the dark base map (rendered brightness, not radiance). The same measure applied to NASA’s separate, higher-resolution annual stills (SVS 5276) tracks it closely: year by year, r = 0.999 for the world and 0.96 for India.';
    $('decade-summaries').replaceChildren(
      ...rows.map((r) => {
        const li = document.createElement('li');
        li.textContent = decadeSentence(r.label, r.series, r.trend, r.change.direction, r.series[0].mapPixels < SMALL_PLACE_PIXELS);
        return li;
      }),
    );
    // Regional comparison: the decade, NASA's change map and NASA's independent 5276 stills side by side.
    const independent: Record<string, number> = {
      world: crosscheck.series.world.light[11] / crosscheck.series.world.light[0],
      india: crosscheck.series.india.light[11] / crosscheck.series.india.light[0],
    };
    const fmt = (x: number) => `${x.toFixed(2)}×`;
    $('decade-compare')
      .querySelector('tbody')!
      .replaceChildren(
        ...rows.map((r) => {
          const tr = document.createElement('tr');
          const ratio = r.series[0].light > 0 ? r.series[11].light / r.series[0].light : NaN;
          const small = r.series[0].mapPixels < SMALL_PLACE_PIXELS;
          const th = document.createElement('th');
          th.scope = 'row';
          th.textContent = r.label;
          const cells = [
            r.series[0].mapPixels.toLocaleString('en'),
            Number.isNaN(ratio) ? '—' : fmt(ratio),
            trendWords(r.trend) + (small ? ' (weak: small box)' : ''),
            r.change.direction ? directionWords(r.change.direction) : 'no lit pixels',
            !r.trend || !r.change.direction ? '—' : r.trend === r.change.direction ? 'agree' : 'differ',
            r.id in independent ? `${fmt(independent[r.id])} (${r.id === 'world' ? 'world map' : 'India view'})` : 'not available',
          ];
          tr.append(th, ...cells.map((t) => Object.assign(document.createElement('td'), { textContent: t })));
          return tr;
        }),
      );
    let same = 0;
    let nearly = 0;
    let opposite = 0;
    for (const c of model.cells) {
      const t = decadeTrend(decadeSeries(fields, cellRect(c.col, c.row)));
      if (!c.direction || !t || c.maskedFraction > 0.5) continue;
      if (c.direction === t) same++;
      else if (c.direction === 'steady' || t === 'steady') nearly++;
      else opposite++;
    }
    const total = same + nearly + opposite;
    $('decade-agreement').textContent =
      `Cell by cell, the two NASA renderings were compared wherever both show lit pixels and the change map is mostly unmasked (${total} cells): ` +
      `they agree on the direction in ${same}, differ only between “little change” and a direction in ${nearly}, and point in opposite directions in ${opposite}. ` +
      'The yearly frames come from compressed video and NASA’s display rendering, so treat single cells with care.';
    window.terrajukeDecade = {
      regions: rows.map((r) => ({
        id: r.id,
        trend: r.trend,
        change: r.change.direction,
        ratio: r.series[11].light / r.series[0].light,
        small: r.series[0].mapPixels < SMALL_PLACE_PIXELS,
        light: r.series.map((s) => s.light),
      })),
      agreement: { same, nearly, opposite },
    };
    status.textContent += ` NASA’s ${fields.length} yearly frames are ready: try “Hear the decade”.`;
  }

  $('decade-table')
    .querySelector('tbody')!
    .replaceChildren(
      ...DECADE_MAPPING_TABLE.map(([a, b]) => {
        const tr = document.createElement('tr');
        for (const t of [a, b]) {
          const td = document.createElement('td');
          td.textContent = t;
          tr.append(td);
        }
        return tr;
      }),
    );

  // ---- Wiring ------------------------------------------------------------------
  buttons.explore.addEventListener('click', () => {
    stopAll(false);
    map.focus();
    showFocus();
    announcer.say(`Explore. ${describeCell(cellAt(focus.col, focus.row))}`);
  });
  buttons.tour.addEventListener('click', () => (mode === 'tour' ? stopAll() : startTour()));
  buttons.legend.addEventListener('click', () => (mode === 'legend' ? stopAll() : startLegend()));
  buttons.decade.addEventListener('click', () => (mode === 'decade' ? stopAll() : startDecade()));
  yearSlider.addEventListener('input', () => {
    if (!decade) return;
    if (mode !== 'explore') stopAll(false);
    audio.unlock();
    const year = Number(yearSlider.value);
    if (year === CHANGE_POSITION) {
      showYear(null);
      playChangeOf(place);
      return;
    }
    showYear(year);
    playYearOf(place, year, 'user');
  });
  changeMapBtn.addEventListener('click', () => {
    if (mode !== 'explore') stopAll(false);
    showYear(null);
    announcer.say('Change map shown.');
    caption.textContent = 'NASA’s change map, 2012 to 2023, is shown.';
  });
  $('btn-stop').addEventListener('click', () => stopAll());
  $('btn-describe').addEventListener('click', () => {
    const h = $('describe-title');
    h.scrollIntoView({ block: 'start' });
    h.focus();
  });

  map.addEventListener('focus', () => showFocus());
  map.addEventListener('keydown', (e) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key in moves) {
      e.preventDefault();
      if (mode !== 'explore') stopAll(false);
      const [dc, dr] = moves[e.key];
      focus = { col: Math.max(0, Math.min(COLS - 1, focus.col + dc)), row: Math.max(0, Math.min(ROWS - 1, focus.row + dr)) };
      insetView.hidden = true;
      showFocus();
      announcer.say(shownYear !== null && decade ? describeYearCell(cellAt(focus.col, focus.row), shownYear) : describeCell(cellAt(focus.col, focus.row)));
    } else if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      if (mode === 'decade') stopAll();
      else {
        const cell = cellAt(focus.col, focus.row);
        if (cell.mapPixels) place = { label: cellPosition(cell), rect: cell.rect, change: cell };
        startDecade();
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      audio.unlock();
      playCell(cellAt(focus.col, focus.row), 'user');
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      if (mode !== 'explore') stopAll(false);
      audio.unlock();
      const n = INSETS.length;
      const idx = e.key === 'End' ? (insetIndex + 1) % n : (insetIndex - 1 + n) % n;
      playInset(idx, 'user');
      announcer.say(insetSentence(model.insets[idx]));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      stopAll();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target !== map && mode !== 'explore') stopAll();
  });

  const cellFromPointer = (e: PointerEvent) => {
    const box = map.getBoundingClientRect();
    const col = Math.floor(((e.clientX - box.left) / box.width) * COLS);
    const row = Math.floor(((e.clientY - box.top) / box.height) * ROWS);
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return null;
    return cellAt(col, row);
  };
  map.addEventListener('pointerdown', (e) => {
    const cell = cellFromPointer(e);
    if (!cell) return;
    if (mode !== 'explore') stopAll(false);
    audio.unlock();
    focus = { col: cell.col, row: cell.row };
    lastHover = `${cell.col},${cell.row}`;
    showFocus();
    playCell(cell, 'user');
  });
  map.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || mode !== 'explore') return;
    const cell = cellFromPointer(e);
    if (!cell) return;
    const key = `${cell.col},${cell.row}`;
    if (key === lastHover) return;
    lastHover = key;
    focus = { col: cell.col, row: cell.row };
    showFocus();
    // Hover plays only after the first click or key press has unlocked audio.
    if (hoverArmed) playCell(cell, 'auto');
  });
  const arm = () => {
    hoverArmed = true;
  };
  map.addEventListener('pointerdown', arm);
  map.addEventListener('keydown', arm);

  status.textContent = `Ready. ${COLS * ROWS} cells analysed in your browser from NASA’s image; ${model.cells.filter((c) => c.direction).length} contain lit map pixels. Each sound lasts ${EVENT_SECONDS} s.`;
  return { enableDecade };
}
