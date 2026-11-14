import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { best, cells, goTo, instrumentAudio, log, notes, openApp } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await instrumentAudio(page);
});

test('the browser’s own analysis of the NASA image matches the expected directions', async ({ page }) => {
  await openApp(page);
  const insets = await page.evaluate(() => window.terrajukeModel!.insets);
  const byId = Object.fromEntries(insets.map((i) => [i.id, i]));
  expect(byId['western-europe'].direction).toBe('less');
  expect(byId['india'].direction).toBe('more');
  for (const i of insets) expect(i.litPixels).toBeGreaterThan(0);
  await expect(page.locator('#status')).toContainText('288 cells analysed');
  await expect(page.locator('#inset-summaries li')).toHaveCount(4);
});

test('a purple-dominant map cell plays a rising pair with a simultaneous pulse and text', async ({ page }) => {
  await openApp(page);
  await page.selectOption('#announce', 'selection');
  const target = best(await cells(page), 'more');
  await goTo(page, target.col, target.row);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await notes(page)).length).toBeGreaterThanOrEqual(2);
  const n = await notes(page);
  expect(n[1].hz).toBeGreaterThan(n[0].hz);
  expect(n[0].type).toBe('sawtooth');
  const entry = (await log(page)).at(-1)!;
  expect(entry.figure).toBe('rising');
  expect(entry.direction).toBe('more');
  expect(entry.audioAt).not.toBeNull();
  expect(Math.abs(entry.pulseAt - entry.audioAt!)).toBeLessThan(50);
  expect(Math.abs(entry.captionAt - entry.audioAt!)).toBeLessThan(50);
  expect(entry.announcedAt).not.toBeNull();
  await expect(page.locator(`.pulse[data-event-id="${entry.id}"]`)).toHaveAttribute('data-direction', 'more');
  await expect(page.locator('#caption')).toHaveText(entry.text);
  await expect(page.locator('#announcer')).toHaveText(entry.text);
  expect(entry.text).toContain('more light');
  expect(entry.text).toContain('rising');
});

test('an orange-dominant map cell plays a falling pair', async ({ page }) => {
  await openApp(page);
  const target = best(await cells(page), 'less');
  await goTo(page, target.col, target.row);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await notes(page)).length).toBeGreaterThanOrEqual(2);
  const n = await notes(page);
  expect(n[1].hz).toBeLessThan(n[0].hz);
  expect(n[0].type).toBe('triangle');
  const entry = (await log(page)).at(-1)!;
  expect(entry.figure).toBe('falling');
  await expect(page.locator(`.pulse[data-event-id="${entry.id}"]`)).toHaveAttribute('data-direction', 'less');
});

test('the legend (masked) and an unlit ocean cell are silent, with no pulse', async ({ page }) => {
  await openApp(page);
  // Row 6 (y 160–191) holds the legend's bright colour bar at x 502–581: cells 15–18.
  for (const [col, row] of [[16, 5], [17, 5], [20, 7]]) {
    await goTo(page, col, row);
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(300);
  expect(await notes(page)).toHaveLength(0);
  expect(await log(page)).toHaveLength(0);
  await expect(page.locator('.pulse')).toHaveCount(0);
  await expect(page.locator('#caption')).toContainText('silent');
});

test('selecting an inset plays its parent region on the map, not the magnified copy', async ({ page }) => {
  await openApp(page);
  await goTo(page, 27, 6); // inside the India inset frame (x 807–944, y 142–279)
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await log(page)).length).toBe(1);
  const entry = (await log(page))[0];
  expect(entry.text).toContain('India map region');
  expect(entry.figure).toBe('rising');
  await expect(page.locator('#inset-view')).toBeVisible();
});

test('keyboard-only: Tab reaches the map, arrows announce once, Home/End jump insets, Escape stops', async ({ page }) => {
  await openApp(page);
  const map = page.locator('#explorer');
  for (let i = 0; i < 12 && !(await map.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(map).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#announcer')).toContainText('Column 10 of 32, row 4 of 9');
  expect(await notes(page)).toHaveLength(0); // moving does not play
  await page.keyboard.press('End');
  await expect.poll(async () => (await log(page)).length).toBe(1);
  await expect(page.locator('#announcer')).toContainText('Western Europe');
  await page.keyboard.press('End');
  await expect(page.locator('#announcer')).toContainText('Eastern Mediterranean');
  await page.keyboard.press('Escape');
  await expect(page.locator('#caption')).toHaveText('Stopped.');
});

test('Stop cancels the tour and its sound', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-tour');
  await expect(page.locator('#btn-tour')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await log(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  await page.click('#btn-stop');
  await expect(page.locator('#btn-tour')).toHaveAttribute('aria-pressed', 'false');
  const count = (await log(page)).length;
  await page.waitForTimeout(2000);
  expect((await log(page)).length).toBe(count);
  await expect(page.locator('.pulse')).toHaveCount(0);
  await expect(page.locator('#announcer')).toHaveText('Stopped.');
});

test('the tour starts with the four inset regions (sounding their map boxes)', async ({ page }) => {
  await openApp(page);
  await page.click('#btn-tour');
  await expect.poll(async () => (await log(page)).length, { timeout: 8000 }).toBeGreaterThanOrEqual(3);
  const texts = (await log(page)).map((e) => e.text);
  expect(texts[0]).toContain('Western Europe map region');
  expect(texts[1]).toContain('Eastern Mediterranean map region');
  await page.click('#btn-stop');
});

test('Listen to the legend plays falling (orange) first and rising (purple) last', async ({ page }) => {
  test.setTimeout(20_000);
  await openApp(page);
  await page.click('#btn-legend');
  await expect.poll(async () => (await log(page)).length, { timeout: 12_000 }).toBe(9);
  const figs = (await log(page)).map((e) => e.figure);
  expect(figs[0]).toBe('falling');
  expect(figs[4]).toBe('single');
  expect(figs[8]).toBe('rising');
});

test.describe('vibration (stubbed)', () => {
  test('is called only when enabled and supported', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __vib: unknown[] };
      w.__vib = [];
      Object.defineProperty(Navigator.prototype, 'vibrate', {
        configurable: true,
        value: (p: unknown) => {
          w.__vib.push(p);
          return true;
        },
      });
    });
    await openApp(page);
    const vib = () => page.evaluate(() => (window as unknown as { __vib: unknown[] }).__vib);
    await expect(page.locator('#vibrate')).toBeVisible();
    await expect(page.getByText('Tactile feedback (supported Android browsers)')).toBeVisible();
    const target = best(await cells(page), 'more');
    await goTo(page, target.col, target.row);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await log(page)).length).toBe(1);
    expect(await vib()).toHaveLength(0);
    await page.check('#vibrate');
    await goTo(page, target.col, target.row);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await log(page)).length).toBe(2);
    expect(await vib()).toEqual([[30, 40, 30]]);
  });

  test('controls are hidden when navigator.vibrate is missing', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: undefined });
    });
    await openApp(page);
    await expect(page.locator('#vibrate-wrap')).toBeHidden();
  });
});

test('reduced motion shows a static outline instead of an animated ring', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  const target = best(await cells(page), 'more');
  await goTo(page, target.col, target.row);
  await page.keyboard.press('Enter');
  const ring = page.locator('.pulse').first();
  await expect(ring).toHaveClass(/pulse-static/);
  expect(await ring.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});

test('summary announcements arrive every 5 s, not per note', async ({ page }) => {
  test.setTimeout(20_000);
  await openApp(page);
  await page.selectOption('#announce', 'summary');
  await page.click('#btn-legend');
  await expect(page.locator('#announcer')).toContainText('Playing the legend');
  await expect(page.locator('#announcer')).toContainText('Last 5 seconds', { timeout: 7000 });
  await page.click('#btn-stop');
});

test('axe finds no accessibility violations (panels open)', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test('page shows credits, limits and SI disclosure', async ({ page }) => {
  await openApp(page);
  const body = page.locator('body');
  await expect(body).toContainText('Kel Elkins');
  await expect(body).toContainText('not radiance');
  await expect(body).toContainText('Claude Code');
  const prov = await page.request.get('/nasa/svs5313.provenance.json');
  expect(prov.ok()).toBe(true);
  expect((await prov.json()).identity).toBe('verified-identical');
});
