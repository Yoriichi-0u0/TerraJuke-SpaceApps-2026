import { test, expect } from '@playwright/test';
import { best, cells, goTo, instrumentAudio, notes, openApp } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await instrumentAudio(page);
});

test('the sound status reports “on” once a gesture starts audio', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#sound-status')).toContainText('starts when you choose');
  const target = best(await cells(page), 'more');
  await goTo(page, target.col, target.row);
  await page.keyboard.press('Enter');
  await expect(page.locator('#sound-status')).toHaveText('Sound: on.');
  expect(await page.evaluate(() => window.terrajukeAudio!.state())).toBe('running');
});

test('a suspended audio context (background tab, call, other app) resumes on the next gesture and plays', async ({ page }) => {
  await openApp(page);
  const target = best(await cells(page), 'more');
  await goTo(page, target.col, target.row);
  await page.keyboard.press('Enter');
  await expect(page.locator('#sound-status')).toHaveText('Sound: on.');
  await page.evaluate(() => window.terrajukeAudio!.suspend());
  await expect.poll(() => page.evaluate(() => window.terrajukeAudio!.state())).toBe('suspended');
  await expect(page.locator('#sound-status')).toContainText('waiting for the browser');
  const before = (await notes(page)).length;
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.terrajukeAudio!.state())).toBe('running');
  await expect(page.locator('#sound-status')).toHaveText('Sound: on.');
  expect((await notes(page)).length).toBeGreaterThan(before);
});

test('on iOS-class browsers the page asks for “playback” audio so the silent switch does not mute it', async ({ page }) => {
  await openApp(page);
  const has = await page.evaluate(() => 'audioSession' in navigator);
  test.skip(!has, 'navigator.audioSession is not implemented in this engine');
  await page.locator('#btn-legend').click();
  expect(await page.evaluate(() => (navigator as unknown as { audioSession: { type: string } }).audioSession.type)).toBe('playback');
});
