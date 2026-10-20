import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
const charizardArtwork = await readFile(new URL('../assets/chases/base1-4.webp', import.meta.url));

/** One static YUV420 frame loops in Chromium's fake camera without native tooling. */
async function createCameraFixture(path) {
  const width = 640;
  const height = 960;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // Fullbleed portrait preview uses a tighter centered ROI than the old
    // header/footer layout. Keep the synthetic card inside the alignment guide
    // with a visible ring of surroundings; detector thresholds remain real.
    const cx = (x - 170) * 400 / 300;
    const cy = (y - 274) * 550 / 412;
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
let activeState;
let passed = 0;
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' }).filter({ visible: true });
const stored = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key);
const pending = page => stored(page, 'chase.scan-session.v1');
const collection = page => stored(page, 'chase.prototype.v1');
const copies = value => (value?.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
const check = async (name, action) => { await action(); console.log(`PASS ${++passed}: ${name}`); };
const reveal = page => page.getByTestId('scan-card-reveal');
async function assertCleanLiveControls(page) {
  for (const name of ['Pause scanning', 'Resume scanning', 'Retry']) assert.equal(await button(page, name).count(), 0, `${name} must not interrupt the live scanner UI.`);
}
async function assertFullCamera(page) {
  const bounds = await page.locator('video').first().boundingBox();
  const viewport = page.viewportSize();
  assert.ok(bounds && viewport && bounds.x <= 1 && bounds.y <= 1 && bounds.width >= viewport.width - 1 && bounds.height >= viewport.height - 1,
    'Camera must cover the screen behind the floating controls, including the former header.');
}
const charizard = { providerId: 'fixture-charizard', name: 'Charizard', setName: 'Base Set', collectorNumber: '4/102', language: 'en', finish: 'holo', confidenceTier: 'High', tcgdexId: 'base1-4' };
const pikachu = { providerId: 'fixture-pikachu', name: 'Pikachu', setName: 'Evolutions', collectorNumber: '35/108', language: 'en', finish: 'unknown', confidenceTier: 'High', tcgdexId: 'xy12-35' };
const greninja = { providerId: 'fixture-greninja', name: 'Greninja ex', setName: 'Twilight Masquerade', collectorNumber: '214/167', language: 'en', finish: 'holo', confidenceTier: 'High', tcgdexId: 'sv6-214' };

async function fixture({ candidates = [charizard], plan = 'pro', permission = true, fail = false, ready = true, catalogMissing = false, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion });
  if (permission) await context.grantPermissions(['camera'], { origin: url });
  const catalogState = await installTCGdexFixtures(context);
  // Render a real catalog illustration in scanner screenshots while keeping all
  // artwork/network requests local and independent of provider availability.
  await context.route('https://assets.tcgdex.net/en/base/base1/4/**', route => route.fulfill({ contentType: 'image/webp', body: charizardArtwork }));
  catalogState.offline = catalogMissing;
  const state = { requests: [], fail, candidates, ready, healthRequests: 0, catalogState, console: [] };
  activeState = state;
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
    globalThis.chaseMediaErrors = [];
    globalThis.syntheticCardStyle = 0;
    // Controlled captured pixels exercise the real JPEG/manipulator/detector path.
    // The provider remains a fixture; these are not photographed/identified cards.
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      const result = draw.call(this, source, ...args);
      if (source?.tagName !== 'VIDEO') return result;
      if (globalThis.chaseFailCaptureOnce) { globalThis.chaseFailCaptureOnce = false; throw new Error('Synthetic camera failure'); }
      const style = globalThis.syntheticCardStyle;
      if (!style) return result;
      const w = this.canvas.width; const h = this.canvas.height;
      if (style === -1) { this.fillStyle = '#a0a0a0'; this.fillRect(0, 0, w, h); return result; }
      this.fillStyle = style === 1 ? 'rgb(30,85,165)' : 'rgb(20,160,80)';
      this.fillRect(w * 0.295, h * 0.357, w * 0.41, h * 0.202);
      this.fillStyle = style === 1 ? 'rgb(190,70,220)' : 'rgb(80,215,190)';
      this.beginPath(); this.ellipse(w * (style === 1 ? 0.44 : 0.56), h * (style === 1 ? 0.43 : 0.48), w * 0.105, h * 0.064, 0, 0, Math.PI * 2); this.fill();
      this.fillStyle = '#e9d079';
      for (let line = 0; line < 5; line++) this.fillRect(w * 0.31, h * (0.37 + line * 0.033), w * 0.03, h * 0.006);
      return result;
    };
    if (navigator.mediaDevices?.getUserMedia) {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = constraints => {
        globalThis.chaseMediaRequests++;
        if (globalThis.chaseFailMediaOnce) {
          globalThis.chaseFailMediaOnce = false;
          const error = new DOMException('Synthetic camera mount failure', 'NotReadableError');
          globalThis.chaseMediaErrors.push(`${error.name}: ${error.message}`);
          return Promise.reject(error);
        }
        return original(constraints).catch(error => { globalThis.chaseMediaErrors.push(`${error.name}: ${error.message}`); throw error; });
      };
    }
  }, plan);
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) state.console.push(message.text()); });
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
    await page.getByText('Card photos are sent to CardSight for identification.', { exact: true }).waitFor();
    const torch = button(page, 'Turn flashlight on');
    await torch.waitFor();
    assert.equal(await torch.getAttribute('aria-disabled'), 'true', 'The torch starts off and is unavailable before camera opt-in.');
    const bounds = await torch.boundingBox();
    assert.ok(bounds && Math.abs(bounds.x + bounds.width / 2 - 195) <= 1, 'Flashlight control must be horizontally centered.');
    await button(page, 'Close scanner, keep pending cards').waitFor();
    await assertCleanLiveControls(page);
    assert.equal(state.requests.length, 0);
    assert.equal(await page.locator('video').count(), 0);
  });
  await check('capture stages the card and reveals its catalog artwork above the live camera', async () => {
    await enable(page);
    await button(page, 'Organize (1)').waitFor();
    await reveal(page).waitFor();
    assert.match(await reveal(page).getAttribute('aria-label'), /Recognized Charizard\. 1 pending cards\./);
    await reveal(page).getByRole('img', { name: 'Charizard, Base Set, 4/102, Pokémon TCG card', exact: true }).waitFor();
    assert.equal(await page.getByText('Added to session', { exact: true }).count(), 0, 'The old recognition popup must be replaced.');
    await assertFullCamera(page);
    await assertCleanLiveControls(page);
    // The card enters from below with pointerEvents=none. Check its settled
    // placement above the action, rather than its intentional entrance path.
    await page.waitForTimeout(450);
    const organize = await button(page, 'Organize (1)').boundingBox();
    const art = await reveal(page).boundingBox();
    assert.ok(organize && art && art.y + art.height <= organize.y + 1, 'The animated card must leave Organize unobstructed.');
    assert.equal(state.requests.length, 1);
    assert.equal(new URL(page.url()).pathname, '/scanner');
    assert.equal((await pending(page)).items[0].cardId, 'tcgdex:en:base1-4:holo');
    assert.equal(copies(await collection(page)), 0);
    await page.screenshot({ path: '/tmp/chase-live-scanner-result.png' });
  });
  await check('stationary camera card remains one recognition while preview continues', async () => {
    await button(page, 'Turn flashlight on').click();
    await page.getByText('Flashlight is available in the Android and iOS app.', { exact: true }).waitFor();
    assert.equal(await button(page, 'Turn flashlight off').count(), 0, 'Browser feedback must not claim to have switched on a hardware torch.');
    await page.waitForTimeout(3500);
    assert.equal(state.requests.length, 1);
    assert.equal(copies(await pending(page)), 1);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('video')].some(video => video.readyState >= 2)));
    await assertCleanLiveControls(page);
    await assertFullCamera(page);
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
  await check('failed recognition explains the error briefly, keeps the held card locked, and scans the next presentation automatically', async () => {
    await enable(failed.page);
    await failed.page.getByText(/Could not reach the scanner or catalog/).waitFor();
    assert.equal(copies(await pending(failed.page)), 0);
    assert.equal(copies(await collection(failed.page)), 0);
    await assertCleanLiveControls(failed.page);
    await failed.page.waitForTimeout(3200);
    assert.equal(failed.state.requests.length, 1, 'A held failed card must not make repeated billable requests after automatic recovery.');
    assert.equal(await failed.page.getByText(/Could not reach the scanner or catalog/).count(), 0, 'The transient error clears without a Retry button.');
    failed.state.fail = false;
    await failed.page.evaluate(() => { globalThis.syntheticCardStyle = 1; });
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
    await enable(small.page); await assertFullCamera(small.page);
    await button(small.page, 'Use demo scanner').click();
    await small.page.getByText('Demo recognition', { exact: true }).waitFor();
  });
  await small.context.close();

  const reduced = await fixture({ reducedMotion: 'reduce' });
  await check('reduced-motion recognition still exposes artwork and a deliberate second copy gets a fresh reveal', async () => {
    const { page, state } = reduced;
    await enable(page); await button(page, 'Organize (1)').waitFor(); await reveal(page).waitFor();
    assert.match(await reveal(page).getAttribute('aria-label'), /Recognized Charizard\. 1 pending cards\./);
    await page.waitForTimeout(2200);
    assert.equal(await reveal(page).count(), 0, 'The reveal must not remain over the live guides indefinitely.');
    await page.evaluate(() => { globalThis.syntheticCardStyle = -1; }); await page.waitForTimeout(2200);
    await page.evaluate(() => { globalThis.syntheticCardStyle = 0; });
    await button(page, 'Organize (2)').waitFor(); await reveal(page).waitFor();
    assert.match(await reveal(page).getAttribute('aria-label'), /Recognized Charizard\. 2 pending cards\./);
    assert.equal(state.requests.length, 2);
    assert.equal((await pending(page)).items.length, 1, 'A deliberate second physical copy merges into the same printing row.');
    assert.equal((await pending(page)).items[0].quantity, 2);
    assert.equal(copies(await collection(page)), 0);
    await assertCleanLiveControls(page); await assertFullCamera(page);
  });
  await reduced.context.close();

  const single = await fixture({ candidates: [{ ...charizard, finish: 'unknown' }] });
  await check('a unique catalog finish saves without a redundant Holo selector or confirmation', async () => {
    const { page } = single; await enable(page); await button(page, 'Organize (1)').waitFor();
    await button(page, 'Organize (1)').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('chase.scan-session.v1')).items[0].ambiguity === 'confirmed');
    assert.equal(await button(page, 'Review Charizard variant').count(), 0);
    assert.equal(await button(page, 'Confirm Holo').count(), 0);
    assert.equal(await button(page, 'Confirm printing').count(), 0);
    await button(page, 'Save all to Collection').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('chase.prototype.v1')).items.length === 1);
  });
  await single.context.close();

  const pendingMatch = await fixture({ catalogMissing: true, plan: 'free' });
  await check('catalog downtime retains an unpriced identification and retry links it without a second provider call', async () => {
    const { page, state } = pendingMatch; await enable(page); await button(page, 'Organize (1)').waitFor();
    assert.equal((await pending(page)).items.length, 0); assert.equal((await pending(page)).unresolved.length, 1);
    assert.equal((await collection(page)).trial.successfulRecognitions, 0);
    await button(page, 'Organize (1)').click();
    await page.getByText('Pending catalog match · Price unavailable', { exact: true }).waitFor();
    await button(page, 'Scan details for Charizard').click();
    await page.getByText('Scan details', { exact: true }).waitFor();
    assert.ok((await page.locator('body').innerText()).includes('fixture-charizard'));
    await button(page, 'Close scan details').click();
    state.catalogState.offline = false;
    await button(page, 'Retry catalog match').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('chase.scan-session.v1')).unresolved.length === 0);
    assert.equal((await pending(page)).items[0].cardId, 'tcgdex:en:base1-4:holo');
    assert.equal((await collection(page)).items.length, 0); assert.equal(state.requests.length, 1);
    await button(page, 'Save all to Collection').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('chase.prototype.v1')).items.length === 1);
  });
  await pendingMatch.context.close();

  const manual = await fixture({ candidates: [{ ...charizard, collectorNumber: '999/102' }] });
  await check('an unresolved number can be explicitly matched to a catalog printing without saving ownership early', async () => {
    const { page } = manual; await enable(page); await button(page, 'Organize (1)').waitFor(); await button(page, 'Organize (1)').click();
    await button(page, 'Match Charizard printing').click();
    await button(page, 'Scanned number: 999 · clear filter').click();
    await button(page, 'Match Charizard, Base Set, 4/102').click();
    await button(page, 'Use this printing').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('chase.scan-session.v1')).items.length === 1);
    assert.equal((await pending(page)).unresolved.length, 0); assert.equal((await collection(page)).items.length, 0);
    assert.ok(await stored(page, 'chase.cardsight-links.v1'));
  });
  await manual.context.close();

  const recovery = await fixture();
  await check('a capture failure recreates the preview and scanning recovers without a permanent busy latch', async () => {
    await recovery.page.evaluate(() => { globalThis.chaseFailCaptureOnce = true; });
    await enable(recovery.page); await button(recovery.page, 'Organize (1)').waitFor();
    assert.equal(recovery.state.requests.length, 1);
    assert.ok(await recovery.page.evaluate(() => globalThis.chaseMediaRequests >= 2));
  });
  await recovery.context.close();

  const mountRecovery = await fixture();
  await check('a failed camera mount after Organize recovers automatically without repeating consent or losing the presentation lock', async () => {
    const { page, state } = mountRecovery;
    await enable(page); await button(page, 'Organize (1)').waitFor();
    await button(page, 'Organize (1)').click();
    await page.evaluate(() => { globalThis.chaseFailMediaOnce = true; });
    await button(page, 'Return to Scanner').first().click();
    await page.waitForFunction(() => globalThis.chaseMediaErrors.some(error => error.includes('Synthetic camera mount failure')));
    await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.readyState >= 2));
    assert.equal(await button(page, 'Enable card scanning').count(), 0, 'Already-consented mount recovery must not require a second opt-in.');
    await page.waitForTimeout(2000);
    assert.equal(state.requests.length, 1, 'Recovering the preview must preserve the held card lock.');
    assert.equal(copies(await pending(page)), 1);
    await assertFullCamera(page); await assertCleanLiveControls(page);
    await page.evaluate(() => { globalThis.syntheticCardStyle = 1; });
    await button(page, 'Organize (2)').waitFor();
    assert.equal(state.requests.length, 2);
  });
  await mountRecovery.context.close();

  const continuous = await fixture();
  await check('twenty captured presentations remain continuous across a failure and repeated Organize returns', async () => {
    const { page, state } = continuous;
    const pool = [charizard, greninja, { ...charizard, providerId: 'fixture-umbreon', name: 'Umbreon VMAX', setName: 'Evolving Skies', collectorNumber: '215/203', tcgdexId: 'swsh7-215' }];
    await enable(page);
    let good = 0;
    for (let index = 0; index < 20; index++) {
      if (process.env.CHASE_LIVE_PROGRESS) console.log(`Presentation ${index + 1}/20; pending ${good}; proxy requests ${state.requests.length}`);
      state.candidates = [pool[index % 3]]; state.fail = index === 4;
      await page.evaluate(style => { globalThis.syntheticCardStyle = style; }, index % 3);
      if (state.fail) {
        await page.getByText(/Could not reach the scanner or catalog/).waitFor();
        const count = state.requests.length;
        await page.waitForTimeout(2600); assert.equal(state.requests.length, count, 'Holding a failed card must not retry automatically.');
        await assertCleanLiveControls(page);
      } else {
        good++; await button(page, `Organize (${good})`).waitFor({ timeout: 25_000 });
        if (good % 5 === 0) {
          await button(page, `Organize (${good})`).click(); await button(page, 'Return to Scanner').first().click();
          await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.readyState >= 2));
          await page.waitForTimeout(900);
          assert.equal(copies(await pending(page)), good);
          await assertFullCamera(page);
        }
      }
    }
    state.fail = false;
    await page.evaluate(() => { globalThis.syntheticCardStyle = -1; }); await page.waitForTimeout(2200);
    await page.evaluate(() => { globalThis.syntheticCardStyle = 1; });
    await button(page, 'Organize (20)').waitFor({ timeout: 25_000 });
    assert.equal(state.requests.length, 21); assert.equal(copies(await pending(page)), 20);
    assert.equal((await collection(page)).items.length, 0);
    await button(page, 'Organize (20)').click(); await button(page, 'Save all to Collection').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('chase.prototype.v1')).items.reduce((sum, item) => sum + item.quantity, 0) === 20);
    await page.screenshot({ path: '/tmp/chase-continuous-session-verified.png' });
  });
  await continuous.context.close();

  assert.deepEqual(errors, []);
  assert.deepEqual(forbiddenRequests, []);
  console.log(`Live scanner passed: ${passed} browser scenarios, no runtime errors or vendor calls. Recognition responses are Chase protocol fixtures, not real CardSight validation.`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: '/tmp/chase-live-scanner-failure.png' }).catch(() => {});
    console.error((await activePage.locator('body').innerText()).slice(-2500));
    console.error('Fixture diagnostics:', JSON.stringify({ proxyRequests: activeState?.requests.length, console: activeState?.console.slice(-8),
      camera: await activePage.evaluate(() => ({ requests: globalThis.chaseMediaRequests, failures: globalThis.chaseMediaErrors, videos: document.querySelectorAll('video').length })).catch(() => null) }));
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
