// Modes (Explore, Tour, Listen to the legend, Describe), keyboard and pointer handling.
import { COLS, ROWS, directionOf, type Cell, type InsetSummary, type RegionStats } from './analyze.ts';
import { AudioEngine } from './audio.ts';
import { cellPosition, directionWords, eventCaption, insetSentence, pct, statsSentence, VISUAL_DESCRIPTION } from './describe.ts';
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
    terrajukeModel?: {
      cells: { col: number; row: number; direction: string | null; litPixels: number; maskedFraction: number; meanChange: number }[];
      insets: { id: string; direction: string | null; litPixels: number }[];
    };
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const TOUR_STEP_MS = 1300;
const LEGEND_STEP_MS = 1000;

function placeBox(el: HTMLElement, r: Rect): void {
  el.hidden = false;
  el.style.left = `${(r.x0 / IMAGE_WIDTH) * 100}%`;
  el.style.top = `${(r.y0 / IMAGE_HEIGHT) * 100}%`;
  el.style.width = `${((r.x1 - r.x0 + 1) / IMAGE_WIDTH) * 100}%`;
  el.style.height = `${((r.y1 - r.y0 + 1) / IMAGE_HEIGHT) * 100}%`;
}

export function startUI(model: Model): void {
  const map = $('explorer');
  const focusBox = $('focus-box');
  const insetView = $('inset-view');
  const caption = $('caption');
  const status = $('status');
  const announcer = new Announcer($('announcer'));
  const audio = new AudioEngine();
  const feedback = new Feedback({ audio, pulseLayer: $('pulse-layer'), caption, announcer });
  const buttons = { explore: $('btn-explore'), tour: $('btn-tour'), legend: $('btn-legend') };

  let focus = { col: 8, row: 3 };
  let insetIndex = -1;
  let timer: number | undefined;
  let mode: 'explore' | 'tour' | 'legend' = 'explore';
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
    if (cell.mapPixels === 0) {
      const idx = insetUnder(cell);
      if (idx >= 0) return playInset(idx, origin);
      caption.textContent = `${cellPosition(cell)}: ${maskReason((cell.rect.x0 + cell.rect.x1) >> 1, (cell.rect.y0 + cell.rect.y1) >> 1) === 'legend' ? 'legend area' : 'masked graphics'} · silent`;
      return;
    }
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
  }

  function stopAll(announce = true): void {
    const wasRunning = mode !== 'explore' || audio.activeVoices > 0;
    window.clearTimeout(timer);
    timer = undefined;
    feedback.stop();
    insetView.hidden = true;
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

  // ---- Wiring ------------------------------------------------------------------
  buttons.explore.addEventListener('click', () => {
    stopAll(false);
    map.focus();
    showFocus();
    announcer.say(`Explore. ${describeCell(cellAt(focus.col, focus.row))}`);
  });
  buttons.tour.addEventListener('click', () => (mode === 'tour' ? stopAll() : startTour()));
  buttons.legend.addEventListener('click', () => (mode === 'legend' ? stopAll() : startLegend()));
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
      announcer.say(describeCell(cellAt(focus.col, focus.row)));
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
}
