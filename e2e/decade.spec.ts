import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { goTo, instrumentAudio, log, notes, openApp } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await instrumentAudio(page);
});

async function openDecade(page: Page): Promise<void> {
  await openApp(page);
  await expect(page.locator('html')).toHaveAttribute('data-decade', 'ready', { timeout: 15_000 });
}

/** End cycles the inset regions from the start: 1 = Western Europe … 4 = India. */
async function chooseRegion(page: Page, presses: number): Promise<void> {
  await page.locator('#explorer').focus();
  for (let i = 0; i < presses; i++) await page.keyboard.press('End');
}

/** Notes started after this moment (performance.now() in the page). */
async function now(page: Page): Promise<number> {
  await page.waitForTimeout(150);
  return page.evaluate(() => performance.now());
}
const after = async (page: Page, t0: number) => (await notes(page)).filter((n) => n.t > t0);

test('the browser reads NASA’s twelve yearly frames and agrees with the expected trends', async ({ page }) => {
  await openDecade(page);
  const d = await page.evaluate(() => window.terrajukeDecade!);
  const byId = Object.fromEntries(d.regions.map((r) => [r.id, r]));
  expect(byId['world'].trend).toBe('more');
  expect(byId['india'].trend).toBe('more');
  expect(byId['western-europe'].trend).toBe('less');
  // Threshold-free brightness above the base map (cross-checked against NASA SVS 5276).
  expect(byId['world'].ratio).toBeGreaterThan(1.15);
  expect(byId['world'].ratio).toBeLessThan(1.35);
  expect(byId['india'].ratio).toBeGreaterThan(1.6);
  expect(byId['india'].ratio).toBeLessThan(2.1);
  expect(byId['western-europe'].ratio).toBeLessThan(0.95);
  expect(byId['ukraine'].small).toBe(true);
  expect(byId['eastern-mediterranean'].small).toBe(true);
  expect(byId['india'].small).toBe(false);
  expect(d.agreement.same + d.agreement.nearly + d.agreement.opposite).toBeGreaterThan(15);
  await expect(page.locator('#decade-summaries li')).toHaveCount(5);
  await expect(page.locator('#decade-agreement')).toContainText('cells');
  await expect(page.locator('#btn-decade')).toBeEnabled();
});

test('Hear the decade for India: 12 yearly notes that end higher, frames in step, then the change map', async ({ page }) => {
  await openDecade(page);
  await chooseRegion(page, 4);
  await expect(page.locator('#caption')).toContainText('India map region');
  const t0 = await now(page);
  await page.locator('#btn-decade').click();
  await expect(page.locator('#btn-decade')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#year-badge')).toHaveText('2016', { timeout: 5000 });
  await expect(page.locator('#year-image')).toHaveAttribute('src', '/nasa/decade/2016.jpg');
  await expect(page.locator('#caption')).toContainText('2016 · India map region');
  // After 2023 the change map returns and plays India's rising pair.
  await expect(page.locator('#caption')).toContainText('NASA’s change map · India map region', { timeout: 10_000 });
  await expect(page.locator('#year-image')).toBeHidden();
  await expect(page.locator('#btn-decade')).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 });
  const n = await after(page, t0);
  const years = n.filter((x) => x.type === 'triangle');
  expect(years).toHaveLength(12);
  // 1.8× the brightness → four pentatonic steps (most of an octave) up.
  expect(years[11].hz / years[0].hz).toBeGreaterThan(1.5);
  expect(years[11].hz / years[0].hz).toBeLessThan(2);
  const cadence = n.filter((x) => x.type === 'sawtooth');
  expect(cadence.length).toBeGreaterThanOrEqual(2);
  expect(cadence[1].hz).toBeGreaterThan(cadence[0].hz);
  const entries = (await log(page)).filter((e) => e.text.startsWith('20'));
  expect(entries).toHaveLength(12);
  for (const e of entries) {
    expect(e.audioAt).not.toBeNull();
    expect(Math.abs(e.pulseAt - e.audioAt!)).toBeLessThan(50);
    expect(Math.abs(e.captionAt - e.audioAt!)).toBeLessThan(50);
  }
  await expect(page.locator('#announcer')).toContainText('India map region: brighter over the decade');
});

test('Western Europe’s decade ends lower than it starts', async ({ page }) => {
  await openDecade(page);
  await chooseRegion(page, 1);
  await expect(page.locator('#caption')).toContainText('Western Europe map region');
  const t0 = await now(page);
  await page.locator('#btn-decade').click();
  await expect(page.locator('#caption')).toContainText('NASA’s change map · Western Europe', { timeout: 10_000 });
  const years = (await after(page, t0)).filter((x) => x.type === 'triangle');
  // The change-map cadence for Western Europe is a falling pair, also triangle: the first 12 are the years.
  expect(years.length).toBeGreaterThanOrEqual(12);
  expect(years[11].hz).toBeLessThan(years[0].hz);
});

test('Ukraine’s small box plays its decade with a weak-reading warning, never a confident claim', async ({ page }) => {
  await openDecade(page);
  await chooseRegion(page, 3);
  await expect(page.locator('#caption')).toContainText('Ukraine map region');
  const t0 = await now(page);
  await page.locator('#btn-decade').click();
  await expect(page.locator('#caption')).toContainText('2023 · Ukraine map region', { timeout: 10_000 });
  await expect(page.locator('#announcer')).toContainText('weak reading', { timeout: 6000 });
  const years = (await after(page, t0)).filter((x) => x.type === 'triangle');
  expect(years.length).toBeGreaterThanOrEqual(12);
});

test('the regional comparison table sets the decade beside NASA’s change map and the independent NASA check', async ({ page }) => {
  await openDecade(page);
  const rows = page.locator('#decade-compare tbody tr');
  await expect(rows).toHaveCount(5);
  await expect(page.locator('#decade-compare tbody th[scope="row"]').first()).toHaveText('The whole map');
  const india = rows.filter({ hasText: 'India map region' });
  await expect(india).toContainText('brighter');
  await expect(india).toContainText('more light');
  await expect(india).toContainText('agree');
  await expect(india).toContainText('India view');
  await expect(rows.filter({ hasText: 'Ukraine map region' })).toContainText('weak: small box');
  await expect(rows.first()).toContainText('world map');
});

test('the year slider shows a frame, plays that year and is keyboard operable; cells then play that year', async ({ page }) => {
  await openDecade(page);
  const slider = page.locator('#year');
  await slider.focus();
  await expect(slider).toHaveAttribute('aria-valuetext', 'Change map, 2012 to 2023');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#year-image')).toHaveAttribute('src', '/nasa/decade/2023.jpg');
  await expect(slider).toHaveAttribute('aria-valuetext', '2023');
  await expect(page.locator('#year-out')).toHaveText('2023 frame shown');
  await expect(page.locator('#caption')).toContainText('2023 · The whole map');
  const d = await page.evaluate(() => window.terrajukeModel!.cells.filter((c) => c.direction === 'more' && c.maskedFraction < 0.5).sort((a, b) => b.litPixels - a.litPixels)[0]);
  await goTo(page, d.col, d.row);
  await expect(page.locator('#announcer')).toContainText('2023 frame');
  const before = (await notes(page)).length;
  await page.keyboard.press('Enter');
  await expect(page.locator('#caption')).toContainText(`2023 · Column ${d.col + 1}`);
  await expect.poll(async () => (await notes(page)).length).toBeGreaterThan(before);
  expect((await notes(page)).at(-1)!.type).toBe('triangle');
  await page.locator('#btn-change-map').click();
  await expect(page.locator('#year-image')).toBeHidden();
  await expect(page.locator('#year-out')).toHaveText('Change map shown');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Change map, 2012 to 2023');
  // Home goes to the first year; End comes back to the change map and plays it.
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(page.locator('#year-image')).toHaveAttribute('src', '/nasa/decade/2012.jpg');
  await page.keyboard.press('End');
  await expect(page.locator('#year-image')).toBeHidden();
  await expect(page.locator('#caption')).toContainText('NASA’s change map');
});

test('D on the map plays the chosen cell’s decade; Escape stops it and restores the change map', async ({ page }) => {
  await openDecade(page);
  await page.locator('#explorer').focus();
  await page.keyboard.press('d');
  await expect(page.locator('#btn-decade')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#year-image')).toBeVisible({ timeout: 3000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#year-image')).toBeHidden();
  await expect(page.locator('#btn-decade')).toHaveAttribute('aria-pressed', 'false');
  const count = (await notes(page)).length;
  await page.waitForTimeout(1200);
  expect((await notes(page)).length).toBe(count);
});

test('axe finds no violations with a yearly frame on show', async ({ page }) => {
  await openDecade(page);
  await page.locator('#year').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#year-image')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  expect(results.violations).toEqual([]);
});
