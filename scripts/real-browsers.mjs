// Live check in installed browsers (not Playwright's bundled engines): Google Chrome, Microsoft
// Edge (Playwright channels) and Safari (safaridriver, WebDriver). For each: the site loads, the
// decade is analysed, India's decade plays 12 yearly notes then the change map, and the audio
// context is running. Usage: node scripts/real-browsers.mjs [url]
// Safari needs "Allow Remote Automation" (Safari ▸ Develop) once.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const URL_ = process.argv[2] ?? 'https://terrajuke-2026.vercel.app/';
const INSTRUMENT = `(() => { if (window.__notes) return; window.__notes = []; const s = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (w) { window.__notes.push({ hz: this.frequency.value, type: this.type }); return s.call(this, w); }; })();`;
const REPORT = `return { ready: document.documentElement.dataset.ready, decade: document.documentElement.dataset.decade,
  audio: window.terrajukeAudio && window.terrajukeAudio.state(), sound: document.getElementById('sound-status').textContent,
  caption: document.getElementById('caption').textContent, notes: (window.__notes || []).length,
  triangles: (window.__notes || []).filter((n) => n.type === 'triangle').length,
  audioSession: 'audioSession' in navigator ? navigator.audioSession.type : 'absent',
  rows: document.querySelectorAll('#decade-compare tbody tr').length, ua: navigator.userAgent };`;
const results = [];

for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel });
  const page = await browser.newPage();
  await page.addInitScript(INSTRUMENT);
  await page.goto(URL_);
  await page.waitForSelector('html[data-decade="ready"]', { timeout: 20000 });
  await page.locator('#explorer').focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('End');
  await page.locator('#btn-decade').click();
  await page.waitForFunction(() => document.getElementById('caption').textContent.startsWith('NASA’s change map'), null, { timeout: 15000 });
  results.push({ browser: channel, version: browser.version(), ...(await page.evaluate(new Function(REPORT))) });
  await browser.close();
}

// Safari through its own WebDriver.
const port = 4545;
const driver = spawn('safaridriver', ['-p', String(port)]);
await new Promise((r) => setTimeout(r, 1500));
const wd = async (method, path, body) => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (json.value && json.value.error) throw new Error(`${path}: ${json.value.error} ${json.value.message}`);
  return json.value;
};
try {
  let session;
  try {
    session = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  } catch (err) {
    results.push({ browser: 'safari', error: String(err.message || err) });
    throw err;
  }
  const id = session.sessionId;
  const exec = (script) => wd('POST', `/session/${id}/execute/sync`, { script, args: [] });
  const find = (css) => wd('POST', `/session/${id}/element`, { using: 'css selector', value: css }).then((e) => Object.values(e)[0]);
  try {
    await wd('POST', `/session/${id}/url`, { url: URL_ });
    for (let i = 0; i < 60 && (await exec('return document.documentElement.dataset.decade')) !== 'ready'; i++) await new Promise((r) => setTimeout(r, 500));
    await exec(INSTRUMENT);
    // Choose India with real key presses on the map, then press the button with a real click.
    const map = await find('#explorer');
    await wd('POST', `/session/${id}/element/${map}/click`, {});
    const end = '';
    await wd('POST', `/session/${id}/actions`, { actions: [{ type: 'key', id: 'k', actions: Array.from({ length: 4 }, () => [{ type: 'keyDown', value: end }, { type: 'keyUp', value: end }]).flat() }] });
    const btn = await find('#btn-decade');
    await wd('POST', `/session/${id}/element/${btn}/click`, {});
    for (let i = 0; i < 40 && !String(await exec("return document.getElementById('caption').textContent")).startsWith('NASA’s change map'); i++) await new Promise((r) => setTimeout(r, 500));
    results.push({ browser: 'safari', ...(await exec(REPORT)) });
  } finally {
    await wd('DELETE', `/session/${id}`);
  }
} catch {
  /* reported below */
} finally {
  driver.kill();
}

for (const r of results) {
  if (r.error) {
    console.log(`SKIP ${r.browser}: ${r.error}`);
    continue;
  }
  const ok = r.ready === 'true' && r.decade === 'ready' && r.audio === 'running' && r.triangles >= 12 && r.rows === 5 && r.caption.startsWith('NASA’s change map');
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.browser}${r.version ? ' ' + r.version : ''}: audio ${r.audio}, ${r.triangles} yearly notes of ${r.notes}, sound "${r.sound}", audioSession ${r.audioSession}, table rows ${r.rows}\n     caption: ${r.caption}\n     ${r.ua}`);
}
