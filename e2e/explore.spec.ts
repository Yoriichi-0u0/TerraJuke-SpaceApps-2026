// Manual exploration with a pointer or finger: what is under the finger is what you hear, see
// and read, at the same moment.
import { test, expect, type Page } from '@playwright/test';
import { best, cells, instrumentAudio, log, notes, openApp, type ModelCell } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await instrumentAudio(page);
});

/** Scroll the map so the cell is visible, then return the viewport point at its centre. */
async function pointOf(page: Page, c: ModelCell): Promise<{ x: number; y: number }> {
  return page.evaluate(({ col, row }) => {
    const map = document.getElementById('explorer')!;
    const scroller = map.parentElement!;
    const box0 = map.getBoundingClientRect();
    const cx = ((col + 0.5) / 32) * box0.width;
    scroller.scrollLeft = Math.max(0, cx - scroller.clientWidth / 2);
    map.scrollIntoView({ block: 'center' });
    const box = map.getBoundingClientRect();
    return { x: box.left + ((col + 0.5) / 32) * box.width, y: box.top + ((row + 0.5) / 9) * box.height };
  }, c);
}

async function press(page: Page, p: { x: number; y: number }, hasTouch: boolean): Promise<void> {
  if (hasTouch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

test('a tap or click plays the cell under it: sound, ring, caption and focus box together', async ({ page, browserName }, info) => {
  await openApp(page);
  const hasTouch = Boolean(info.project.use.hasTouch);
  const target = best(await cells(page), 'more');
  const before = (await notes(page)).length;
  await press(page, await pointOf(page, target), hasTouch);
  await expect.poll(async () => (await notes(page)).length).toBeGreaterThanOrEqual(before + 2);
  const entry = (await log(page)).at(-1)!;
  expect(entry.direction).toBe('more');
  expect(entry.text).toContain(`Column ${target.col + 1} of 32, row ${target.row + 1} of 9`);
  expect(Math.abs(entry.pulseAt - entry.audioAt!)).toBeLessThan(50);
  expect(Math.abs(entry.captionAt - entry.audioAt!)).toBeLessThan(50);
  await expect(page.locator('#caption')).toHaveText(entry.text);
  // The ring and the focus box sit on the cell that was pressed.
  const geo = await page.evaluate(({ id }) => {
    const map = document.getElementById('explorer')!.getBoundingClientRect();
    const ring = document.querySelector(`.pulse[data-event-id="${id}"]`)!.getBoundingClientRect();
    const focus = document.getElementById('focus-box')!.getBoundingClientRect();
    const col = (r: DOMRect) => Math.floor(((r.left + r.width / 2 - map.left) / map.width) * 32);
    const row = (r: DOMRect) => Math.floor(((r.top + r.height / 2 - map.top) / map.height) * 9);
    return { ring: [col(ring), row(ring)], focus: [col(focus), row(focus)] };
  }, { id: entry.id });
  expect(geo.ring).toEqual([target.col, target.row]);
  expect(geo.focus).toEqual([target.col, target.row]);
  await expect(page.locator('#sound-status')).toHaveText('Sound: on.');
  void browserName;
});

test('mouse hover plays only after a first click or key press', async ({ page }, info) => {
  test.skip(Boolean(info.project.use.hasTouch), 'hover exists only with a mouse');
  await openApp(page);
  const all = await cells(page);
  const a = best(all, 'more');
  const b = all.find((c) => c.direction && c.maskedFraction < 0.5 && (c.col !== a.col || c.row !== a.row))!;
  const pb = await pointOf(page, b);
  await page.mouse.move(pb.x, pb.y);
  await page.waitForTimeout(200);
  expect(await notes(page)).toHaveLength(0);
  await page.mouse.click((await pointOf(page, a)).x, (await pointOf(page, a)).y);
  const after = (await notes(page)).length;
  await page.mouse.move(pb.x, pb.y);
  await expect.poll(async () => (await notes(page)).length).toBeGreaterThan(after);
  await expect(page.locator('#caption')).toContainText(`Column ${b.col + 1} of 32`);
});

test('with a yearly frame shown, a tap plays that year for the cell under the finger', async ({ page }, info) => {
  await openApp(page);
  await expect(page.locator('html')).toHaveAttribute('data-decade', 'ready', { timeout: 15_000 });
  await page.locator('#year').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('#year-out')).toHaveText('2012 frame shown');
  const target = best(await cells(page), 'more');
  const before = (await notes(page)).length;
  await press(page, await pointOf(page, target), Boolean(info.project.use.hasTouch));
  await expect(page.locator('#caption')).toContainText(`2012 · Column ${target.col + 1} of 32, row ${target.row + 1} of 9`);
  await expect.poll(async () => (await notes(page)).length).toBeGreaterThan(before);
  expect((await notes(page)).at(-1)!.type).toBe('triangle');
  await expect(page.locator('#year-image')).toBeVisible();
});
