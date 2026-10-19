import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { installTCGdexFixtures } from './fixtures/tcgdex.mjs';

// Run against an independent Expo web process with these DEVELOPMENT settings:
// EXPO_PUBLIC_SCANNER_URL=http://localhost:8787
// EXPO_PUBLIC_SCANNER_TOKEN=chase-browser-fixture-pairing-only-1234
// npm run web -- --localhost --port 8083
// This script intercepts Chase's normalized proxy protocol and the TCGdex API.
// It never supplies a vendor credential or calls CardSight. Real capture, JPEG
// manipulation, local pixel analysis and session/save logic still execute.
const url = process.env.CHASE_SMOKE_URL ?? 'http://localhost:8083';
const proxy = process.env.CHASE_SCANNER_PROXY_URL ?? 'http://localhost:8787';
const pairingToken = 'chase-browser-fixture-pairing-only-1234';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Live smoke must use a local test server.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(proxy).hostname), 'Proxy fixtures must use a local origin.');
const directory = await mkdtemp(join(tmpdir(), 'chase-live-camera-'));
const capturePath = join(directory, 'synthetic-card.y4m');

/** One static YUV420 frame loops in Chromium's fake camera without native tooling. */
async function createCameraFixture(path) {
  const width = 640;
  const height = 960;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cx = x - 120;
    const cy = y - 205;
    let color = [185, 179, 170];
    if (cx >= 0 && cx <= 400 && cy >= 0 && cy <= 550) {
      color = [235, 200, 65];
      if (cx >= 22 && cx <= 378 && cy >= 22 && cy <= 528) {
        color = [215, 205, 175];
        if (cy >= 44 && cy <= 60 && cx >= 58 && cx <= 342) color = [35, 30, 30];
        if (cx >= 24 && cx <= 376 && cy >= 90 && cy <= 350) {
          color = [160, 55, 25];
          if ((cx - 208) ** 2 / 105 ** 2 + (cy - 225) ** 2 / 90 ** 2 <= 1) color = [240, 150, 40];
          if ((cy - 100) % 35 >= 0 && (cy - 100) % 35 <= 3) color = [180, 80, 40];
        }
        if (cy >= 390 && cy <= 513 && cy % 30 <= 4 && cx >= 40 && cx <= 355) color = [65, 60, 55];
      }
    }
    const p = (y * width + x) * 3;
    for (let c = 0; c < 3; c++) rgb[p + c] = color[c];
  }
  const pixels = width * height;
  const yuv = Buffer.alloc(pixels * 3 / 2);
  const clamp = value => Math.max(0, Math.min(255, Math.round(value)));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 3;
    yuv[y * width + x] = clamp(16 + 0.257 * rgb[p] + 0.504 * rgb[p + 1] + 0.098 * rgb[p + 2]);
    if (x % 2 === 0 && y % 2 === 0) {
      const color = [0, 0, 0];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const a = ((y + dy) * width + x + dx) * 3;
        for (let c = 0; c < 3; c++) color[c] += rgb[a + c] / 4;
      }
      const index = y / 2 * (width / 2) + x / 2;
      yuv[pixels + index] = clamp(128 - 0.148 * color[0] - 0.291 * color[1] + 0.439 * color[2]);
      yuv[pixels + pixels / 4 + index] = clamp(128 + 0.439 * color[0] - 0.368 * color[1] - 0.071 * color[2]);
    }
  }
  await writeFile(path, Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F5:1 Ip A1:1 C420jpeg\nFRAME\n`), yuv]));
}

await createCameraFixture(capturePath);
const browser = await chromium.launch({
  executablePath: process.env.CHASE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${capturePath}`],
});
const errors = [];
const forbiddenRequests = [];
let activePage;
let passed = 0;
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' }).filter({ visible: true });
const stored = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key);
const pending = page => stored(page, 'chase.scan-session.v1');
const collection = page => stored(page, 'chase.prototype.v1');
const copies = value => (value?.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
const check = async (name, action) => { await action(); console.log(`PASS ${++passed}: ${name}`); };
const charizard = { providerId: 'fixture-charizard', name: 'Charizard', setName: 'Base Set', collectorNumber: '4/102', language: 'en', finish: 'holo', confidenceTier: 'High', tcgdexId: 'base1-4' };
const pikachu = { providerId: 'fixture-pikachu', name: 'Pikachu', setName: 'Evolutions', collectorNumber: '35/108', language: 'en', finish: 'unknown', confidenceTier: 'High', tcgdexId: 'xy12-35' };
const greninja = { providerId: 'fixture-greninja', name: 'Greninja ex', setName: 'Twilight Masquerade', collectorNumber: '214/167', language: 'en', finish: 'holo', confidenceTier: 'High', tcgdexId: 'sv6-214' };

async function fixture({ candidates = [charizard], plan = 'pro', permission = true, fail = false, ready = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (permission) await context.grantPermissions(['camera'], { origin: url });
  await installTCGdexFixtures(context);
  const state = { requests: [], fail, candidates, ready, healthRequests: 0 };
  await context.route(/https?:\/\/[^/]*cardsight\.ai\//, route => {
    forbiddenRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await context.route(`${proxy}/**`, async route => {
    const request = route.request();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (new URL(request.url()).pathname === '/health') {
      state.healthRequests++;
      return route.fulfill({ status: 200, headers, json: { ready: state.ready, mode: 'local-development' } });
    }
    assert.equal(new URL(request.url()).pathname, '/recognize');
    assert.equal(request.method(), 'POST');
    assert.equal(request.headers().authorization, `Bearer ${pairingToken}`);
    assert.equal(request.headers()['x-api-key'], undefined, 'Vendor authentication must not reach the app.');
    const payload = request.postDataJSON();
    assert.equal(payload.image.mimeType, 'image/jpeg');
    assert.ok(payload.image.base64.startsWith('/9j/'), 'Real capture must produce JPEG bytes.');
    assert.ok(payload.image.base64.length < 8 * 1024 * 1024);
    assert.ok(typeof payload.requestId === 'string' && payload.requestId.length > 0);
    state.requests.push({ requestId: payload.requestId, bytes: Buffer.from(payload.image.base64, 'base64').length });
    if (state.fail) return route.abort('failed');
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ candidates: state.candidates }) });
  });
  await context.addInitScript(plan => {
    if (!localStorage.getItem('chase.prototype.v1')) localStorage.setItem('chase.prototype.v1', JSON.stringify({ onboardingComplete: true, plan, trial: { successfulRecognitions: 0 }, items: [] }));
    globalThis.chaseMediaRequests = 0;
    if (navigator.mediaDevices?.getUserMedia) {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = constraints => { globalThis.chaseMediaRequests++; return original(constraints); };
    }
  }, plan);
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto(`${url}/scanner`);
  await button(page, ready ? 'Enable card scanning' : 'Retry connection').waitFor({ timeout: 60_000 });
  await button(page, 'Organize (0)').waitFor();
  return { page, context, state };
}

async function enable(page) {
  await button(page, 'Enable card scanning').click();
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.readyState >= 2));
}

try {
  const normal = await fixture();
  const { page, state } = normal;
  await check('configured scanner starts in real mode with an explicit image-upload opt-in', async () => {
    await page.getByText('CardSight · Test', { exact: true }).waitFor();
    await page.getByText('Card photos are sent to CardSight for identification.', { exact: true }).waitFor();
    assert.equal(state.requests.length, 0);
    assert.equal(await page.locator('video').count(), 0);
  });
  await check('fake-camera pixels traverse the real capture/JPEG/detector path and stage a compact result', async () => {
    await enable(page);
    await button(page, 'Organize (1)').waitFor();
    await page.getByText('Added to session', { exact: true }).waitFor();
    assert.equal(state.requests.length, 1);
    assert.equal(new URL(page.url()).pathname, '/scanner');
    assert.equal((await pending(page)).items[0].cardId, 'tcgdex:en:base1-4:holo');
    assert.equal(copies(await collection(page)), 0);
    await page.screenshot({ path: '/tmp/chase-live-scanner-result.png' });
  });
  await check('stationary camera card remains one recognition while preview continues', async () => {
    await page.waitForTimeout(3500);
    assert.equal(state.requests.length, 1);
    assert.equal(copies(await pending(page)), 1);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('video')].some(video => video.readyState >= 2)));
    await button(page, 'Pause scanning').click();
    await page.getByText('Scanning paused', { exact: true }).waitFor();
    await button(page, 'Resume scanning').click();
    await page.waitForTimeout(1800);
    assert.equal(state.requests.length, 1);
  });
  await check('Organize pauses camera, edits staging only and retains the live session through details', async () => {
    await page.evaluate(() => { globalThis.chaseLiveTestTrack = document.querySelector('video').srcObject.getVideoTracks()[0]; });
    await button(page, 'Organize (1)').click();
    await page.waitForFunction(() => globalThis.chaseLiveTestTrack.readyState === 'ended');
    await button(page, 'Increase pending Charizard quantity').click();
    await page.getByText('2 pending cards', { exact: true }).waitFor();
    assert.equal(copies(await collection(page)), 0);
    await button(page, 'Details for pending Charizard, Holo').click();
    await button(page, 'Return to Organize').click();
    await page.getByText('2 pending cards', { exact: true }).waitFor();
    await button(page, 'Return to Scanner').first().click();
    await button(page, 'Organize (2)').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.readyState >= 2));
    await page.waitForTimeout(2800);
    assert.equal(state.requests.length, 1, 'Returning to a stationary card must preserve presentation lock.');
  });
  await check('explicit Organize save commits the correct real printing once', async () => {
    await button(page, 'Organize (2)').click();
    await button(page, 'Save all to Collection').click();
    await page.getByText('2 copies saved to Collection.', { exact: true }).waitFor();
    const saved = await collection(page);
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].cardId, 'tcgdex:en:base1-4:holo');
    assert.equal(saved.items[0].quantity, 2);
    assert.equal(copies(await pending(page)), 0);
    await page.reload();
    await page.getByText('No pending cards', { exact: true }).waitFor();
    assert.equal(copies(await collection(page)), 2);
  });
  await normal.context.close();

  const unavailable = await fixture({ ready: false });
  await check('unavailable server prevents camera access and image submission until connection retry succeeds', async () => {
    const { page, state } = unavailable;
    await page.getByText('Scanner unavailable', { exact: true }).waitFor();
    assert.equal(await button(page, 'Enable card scanning').count(), 0);
    assert.equal(await page.locator('video').count(), 0);
    assert.equal(await page.evaluate(() => globalThis.chaseMediaRequests), 0);
    assert.equal(state.requests.length, 0);
    state.ready = true;
    await button(page, 'Retry connection').click();
    await button(page, 'Enable card scanning').waitFor();
    assert.ok(state.healthRequests >= 2);
    assert.equal(await page.evaluate(() => globalThis.chaseMediaRequests), 0, 'Readiness recovery still requires explicit camera opt-in.');
    assert.equal(state.requests.length, 0);
    await enable(page);
    await button(page, 'Organize (1)').waitFor();
    assert.equal(state.requests.length, 1);
  });
  await unavailable.context.close();

  const failed = await fixture({ fail: true });
  await check('failed proxy transport keeps pending state empty and manual retry recovers', async () => {
    await enable(failed.page);
    await button(failed.page, 'Retry').waitFor();
    assert.equal(copies(await pending(failed.page)), 0);
    assert.equal(copies(await collection(failed.page)), 0);
    failed.state.fail = false;
    await button(failed.page, 'Retry').click();
    await button(failed.page, 'Organize (1)').waitFor();
    assert.equal(failed.state.requests.length, 2);
  });
  await failed.context.close();

  const review = await fixture({ candidates: [pikachu] });
  await check('unresolved finish is unpriced and blocked from saving until explicit variant confirmation', async () => {
    const { page } = review;
    await enable(page);
    await button(page, 'Organize (1)').waitFor();
    await button(page, 'Organize (1)').click();
    await page.getByText('Price unavailable', { exact: true }).filter({ visible: true }).first().waitFor();
    const row = (await pending(page)).items[0];
    assert.equal(row.ambiguity, 'review');
    assert.equal(row.price, null);
    await button(page, 'Save all to Collection').click();
    await page.getByText('Confirm the variant before saving.', { exact: true }).waitFor();
    assert.equal(copies(await collection(page)), 0);
    await button(page, 'Review Pikachu variant').click();
    await button(page, 'Confirm Reverse holo').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('chase.scan-session.v1')).items[0].price?.amount === 4.2);
    await button(page, 'Save all to Collection').click();
    await page.getByText('1 copy saved to Collection.', { exact: true }).waitFor();
    assert.equal((await collection(page)).items[0].cardId, 'tcgdex:en:xy12-35:reverse');
  });
  await review.context.close();

  const ambiguous = await fixture({ candidates: [charizard, greninja] });
  await check('multiple exact printings require a chooser before staging', async () => {
    const { page } = ambiguous;
    await enable(page);
    await page.getByText('Choose the printing', { exact: true }).waitFor();
    assert.equal(copies(await pending(page)), 0);
    await button(page, 'Choose Greninja ex, Twilight Masquerade, 214/167').click();
    await button(page, 'Organize (1)').waitFor();
    assert.equal((await pending(page)).items[0].cardId, 'tcgdex:en:sv6-214:holo');
    assert.equal(new URL(page.url()).pathname, '/scanner');
  });
  await ambiguous.context.close();

  for (const [reason, changes] of [['missing language', { language: 'und' }], ['Medium confidence tier', { confidenceTier: 'Medium' }]]) {
    const uncertain = await fixture({ candidates: [{ ...charizard, ...changes }] });
    await check(`${reason} requires English printing confirmation before staging`, async () => {
      const { page } = uncertain;
      await enable(page);
      await page.getByText('Confirm the English printing.', { exact: true }).waitFor();
      assert.equal(copies(await pending(page)), 0);
      await button(page, 'Choose Charizard, Base Set, 4/102').click();
      await button(page, 'Organize (1)').waitFor();
      assert.equal((await pending(page)).items[0].ambiguity, 'confirmed');
      assert.equal((await pending(page)).items[0].confidence, undefined, 'No invented exact probability.');
      assert.equal(new URL(page.url()).pathname, '/scanner');
    });
    await uncertain.context.close();
  }

  const denied = await fixture({ permission: false });
  await check('permission denial remains recoverable and the explicit demo makes no proxy requests', async () => {
    const { page } = denied;
    await button(page, 'Enable card scanning').click();
    await page.getByText('Camera permission is required for real scanning.', { exact: true }).waitFor();
    await button(page, 'Use demo scanner').click();
    await page.getByText('Demo recognition', { exact: true }).waitFor();
    await button(page, 'Present next demo card').click();
    await button(page, 'Organize (1)').waitFor();
    assert.equal((await pending(page)).items[0].cardId, 'base1-4');
    assert.equal(denied.state.requests.length, 0);
  });
  await denied.context.close();

  const small = await fixture();
  await check('narrow real scanner keeps its persistent Organize action within the viewport', async () => {
    await small.page.setViewportSize({ width: 320, height: 568 });
    assert.ok(await small.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const bounds = await button(small.page, 'Organize (0)').boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 569);
    await button(small.page, 'Use demo scanner').click();
    await small.page.getByText('Demo recognition', { exact: true }).waitFor();
  });
  await small.context.close();

  assert.deepEqual(errors, []);
  assert.deepEqual(forbiddenRequests, []);
  console.log(`Live scanner passed: ${passed} browser scenarios, no runtime errors or vendor calls. Recognition responses are Chase protocol fixtures, not real CardSight validation.`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: '/tmp/chase-live-scanner-failure.png' }).catch(() => {});
    console.error((await activePage.locator('body').innerText()).slice(-2500));
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
