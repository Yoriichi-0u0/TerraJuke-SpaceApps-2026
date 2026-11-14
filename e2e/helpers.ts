import { expect, type Page } from '@playwright/test';

export interface ModelCell {
  col: number;
  row: number;
  direction: string | null;
  litPixels: number;
  maskedFraction: number;
  meanChange: number;
}

/** Records every oscillator start (frequency, waveform) before the app loads. */
export async function instrumentAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __notes: { hz: number; type: string; t: number }[]; __oscStops: number };
    w.__notes = [];
    w.__oscStops = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (this: OscillatorNode, when?: number) {
      w.__notes.push({ hz: this.frequency.value, type: this.type, t: performance.now() });
      return start.call(this, when);
    };
    const stop = OscillatorNode.prototype.stop;
    OscillatorNode.prototype.stop = function (this: OscillatorNode, when?: number) {
      if (when === undefined) w.__oscStops++;
      return stop.call(this, when);
    };
  });
}

export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

export async function cells(page: Page): Promise<ModelCell[]> {
  return page.evaluate(() => window.terrajukeModel!.cells);
}

export function best(all: ModelCell[], direction: string): ModelCell {
  const c = all
    .filter((x) => x.direction === direction && x.maskedFraction < 0.5)
    .sort((a, b) => b.litPixels - a.litPixels)[0];
  if (!c) throw new Error(`no ${direction} cell`);
  return c;
}

/** Move the keyboard focus cell from wherever it is to (col, row) with arrow keys. */
export async function goTo(page: Page, col: number, row: number): Promise<void> {
  const map = page.locator('#explorer');
  await map.focus();
  for (let i = 0; i < 32; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < col; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < row; i++) await page.keyboard.press('ArrowDown');
}

export async function notes(page: Page): Promise<{ hz: number; type: string; t: number }[]> {
  return page.evaluate(() => (window as unknown as { __notes: { hz: number; type: string; t: number }[] }).__notes);
}

export async function log(page: Page) {
  return page.evaluate(() => window.terrajukeLog ?? []);
}
