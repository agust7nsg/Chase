import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { fixtureCards, installTCGdexFixtures } from './fixtures/tcgdex.mjs';

// Run against an independent Expo web process with these DEVELOPMENT settings:
// EXPO_PUBLIC_SCANNER_URL=http://localhost:8787
// EXPO_PUBLIC_SCANNER_TOKEN=chase-browser-fixture-pairing-only-1234
// npm run web -- --localhost --port 8083
// This script intercepts Chase's normalized proxy protocol and the TCGdex API.
// It never supplies a vendor credential or calls CardSight. Real capture, JPEG
// manipulation, local pixel analysis and session/save logic still execute.
const url = process.env.CHASE_SMOKE_URL ?? 'http://localhost:8083';
const hosted = process.env.CHASE_HOSTED_SCANNER === '1';
const hostedRoot = 'https://vzjekkgyrdxzlhaupnrw.supabase.co';
const proxy = process.env.CHASE_SCANNER_PROXY_URL ?? (hosted ? `${hostedRoot}/functions/v1/cardsight-scanner` : 'http://localhost:8787');
const pairingToken = 'chase-browser-fixture-pairing-only-1234';
const hostedUser = { id: '12345678-1234-1234-1234-123456789abc', email: 'scanner-fixture@example.com', aud: 'authenticated', role: 'authenticated', is_anonymous: false, email_confirmed_at: '2026-10-21T00:00:00Z', created_at: '2026-10-21T00:00:00Z', app_metadata: {}, user_metadata: {} };
const hostedToken = () => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: hostedUser.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })).toString('base64url'), 'fixture-signature'].join('.');
const focus = process.env.CHASE_LIVE_FOCUS;
assert.ok(!focus || ['catalog', 'slow', 'during', 'art', 'appearance', 'diagnostics'].includes(focus), 'Unknown live-scanner focus.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Live smoke must use a local test server.');
assert.ok(hosted ? proxy === `${hostedRoot}/functions/v1/cardsight-scanner` : ['localhost', '127.0.0.1'].includes(new URL(proxy).hostname), 'Only the explicit intercepted hosted project or a local proxy is supported.');
const directory = await mkdtemp(join(tmpdir(), 'chase-live-camera-'));
const capturePath = join(directory, 'synthetic-card.y4m');

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
async function recordedReveal(page, count) {
  // Feedback deliberately lasts 1.8s. Observe its actual DOM lifetime in-page,
  // rather than missing it between several slow automation round trips.
  await page.waitForFunction(count => globalThis.chaseReveals?.some(row => row.label.includes(`${count} pending cards.`) && row.bounds), count);
  return page.evaluate(count => globalThis.chaseReveals.find(row => row.label.includes(`${count} pending cards.`) && row.bounds), count);
}
async function assertCleanLiveControls(page) {
  for (const name of ['Pause scanning', 'Resume scanning', 'Retry']) assert.equal(await button(page, name).count(), 0, `${name} must not interrupt the live scanner UI.`);
}
async function assertFullCamera(page) {
  // A bounded capture timeout can release/reopen the preview between checks.
  // Verify the recovered surface rather than taking a one-frame snapshot of
  // that intentional release interval; permanent recovery failure still fails.
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => {
    const bounds = video.getBoundingClientRect();
    return video.readyState >= 2 && bounds.x <= 1 && bounds.y <= 1
      && bounds.width >= innerWidth - 1 && bounds.height >= innerHeight - 1;
  }), undefined, { timeout: 10_000 });
  const bounds = await page.locator('video').first().boundingBox();
  const viewport = page.viewportSize();
  assert.ok(bounds && viewport && bounds.x <= 1 && bounds.y <= 1 && bounds.width >= viewport.width - 1 && bounds.height >= viewport.height - 1,
    'Camera must cover the screen behind the floating controls, including the former header.');
}
const charizard = { providerId: 'fixture-charizard', name: 'Charizard', setName: 'Base Set', collectorNumber: '4/102', language: 'en', finish: 'holo', confidenceTier: 'High' };
const pikachu = { providerId: 'fixture-pikachu', name: 'Pikachu', setName: 'Evolutions', collectorNumber: '35/108', language: 'en', finish: 'unknown', confidenceTier: 'High' };
const greninja = { providerId: 'fixture-greninja', name: 'Greninja ex', setName: 'Twilight Masquerade', collectorNumber: '214/167', language: 'en', finish: 'holo', confidenceTier: 'High' };
// Real CardSight supplies its own opaque identity. Canonical TCGdex IDs are not
// handed to the app by these normal fixtures: set/name/number resolution runs.
const artworkPool = [
  ['base1-4', charizard], ['sv6-214', greninja],
  ['swsh7-215', { ...charizard, providerId: 'fixture-umbreon', name: 'Umbreon VMAX', setName: 'Evolving Skies', collectorNumber: '215/203' }],
  ['swsh7-192', { ...charizard, providerId: 'fixture-dragonite', name: 'Dragonite V', setName: 'Evolving Skies', collectorNumber: '192/203' }],
  ['swsh7-218', { ...charizard, providerId: 'fixture-rayquaza', name: 'Rayquaza VMAX', setName: 'Evolving Skies', collectorNumber: '218/203' }],
  ['swsh11-186', { ...charizard, providerId: 'fixture-giratina', name: 'Giratina V', setName: 'Lost Origin', collectorNumber: '186/196' }],
  ['swsh8-271', { ...charizard, providerId: 'fixture-gengar', name: 'Gengar VMAX', setName: 'Fusion Strike', collectorNumber: '271/264' }],
  ['swsh12-186', { ...charizard, providerId: 'fixture-lugia', name: 'Lugia V', setName: 'Silver Tempest', collectorNumber: '186/195' }],
  ['swsh8-269', { ...charizard, providerId: 'fixture-mew', name: 'Mew VMAX', setName: 'Fusion Strike', collectorNumber: '269/264' }],
];
const artworkBytes = await Promise.all(artworkPool.map(([id]) => readFile(new URL(`../assets/chases/${id}.webp`, import.meta.url))));
const cameraArtwork = artworkBytes.map(bytes => `data:image/webp;base64,${bytes.toString('base64')}`);
async function loadCameraArtwork(page) {
  await page.evaluate(async sources => {
    globalThis.chaseCameraArt = await Promise.all(sources.map(src => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
    })));
  }, cameraArtwork);
}
async function presentArtwork(page, index, scale = 1) {
  await page.evaluate(({ index, scale }) => { globalThis.cameraArtworkIndex = index; globalThis.cameraArtworkScale = scale; globalThis.syntheticCardStyle = 0; }, { index, scale });
}

async function fixture({ candidates = [charizard], plan = 'pro', permission = true, fail = false, ready = true, catalogMissing = false, reducedMotion = 'no-preference', catalogDelayMs = 0, providerDelayMs = 0, authenticated = true, access = true, trialUsed = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion });
  if (permission) await context.grantPermissions(['camera'], { origin: url });
  const catalogState = await installTCGdexFixtures(context);
  // Render a real catalog illustration in scanner screenshots while keeping all
  // artwork/network requests local and independent of provider availability.
  await context.route('https://assets.tcgdex.net/**', route => {
    const index = artworkPool.findIndex(([id]) => route.request().url().startsWith(`${fixtureCards.get(id)?.image}/`));
    return index >= 0 ? route.fulfill({ contentType: 'image/webp', headers: { 'access-control-allow-origin': '*' }, body: artworkBytes[index] }) : route.fallback();
  });
  catalogState.offline = catalogMissing;
  const state = { requests: [], fail, candidates, ready, healthRequests: 0, guestSignUps: 0, catalogState, catalogDelayMs, providerDelayMs, console: [] };
  await context.route('https://api.tcgdex.net/**', async route => {
    if (state.catalogDelayMs) await new Promise(resolve => setTimeout(resolve, state.catalogDelayMs));
    await route.fallback();
  });
  activeState = state;
  if (hosted) {
    let guestUser = { ...hostedUser, is_anonymous:true, email:undefined, email_confirmed_at:undefined };
    await context.route(`${hostedRoot}/auth/v1/**`, async route => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'x-supabase-api-version', 'x-supabase-api-version': '2024-01-01' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const user = authenticated ? hostedUser : guestUser;
      if (new URL(route.request().url()).pathname === '/auth/v1/signup') {
        state.guestSignUps++;
        return route.fulfill({ status:200, headers, json: { access_token:hostedToken(), refresh_token:'fixture-guest-refresh', expires_in:3600, token_type:'bearer', user } });
      }
      if (new URL(route.request().url()).pathname === '/auth/v1/token') {
        guestUser = { ...hostedUser,user_metadata:{ chase_password_setup:true } };
        return route.fulfill({ status:200,headers,json:{ access_token:hostedToken(),refresh_token:'fixture-guest-refresh',expires_in:3600,token_type:'bearer',user:guestUser } });
      }
      assert.equal(new URL(route.request().url()).pathname, '/auth/v1/user');
      if (!authenticated && route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        if (body.email) {
          assert.equal(body.password,undefined,'Supabase guest passwords require email verification first.');
          state.guestRedirect = new URL(route.request().url()).searchParams.get('redirect_to');
          guestUser = { ...guestUser, user_metadata:{ chase_password_setup:true } };
        } else if (body.password) {
          assert.equal(guestUser.is_anonymous,false);
          guestUser = { ...guestUser,user_metadata:{ chase_password_setup:false } };
        }
        return route.fulfill({ status:200,headers,json:guestUser });
      }
      return route.fulfill({ status: 200, headers, json: user });
    });
    if (authenticated) await context.addInitScript(({ token, user }) => {
      localStorage.setItem('chase.auth.vzjekkgyrdxzlhaupnrw.v1', JSON.stringify({ access_token: token, refresh_token: 'fixture-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }));
    }, { token: hostedToken(), user: hostedUser });
  }
  await context.route(/https?:\/\/[^/]*cardsight\.ai\//, route => {
    forbiddenRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await context.route(`${proxy}/**`, async route => {
    const request = route.request();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type,apikey', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (hosted) { assert.match(request.headers().authorization ?? '', /^Bearer ey/); assert.match(request.headers().apikey ?? '', /^sb_publishable_/); }
    if (new URL(request.url()).pathname.endsWith('/health')) {
      state.healthRequests++;
      return route.fulfill({ status: trialUsed ? 429 : access ? 200 : 403, headers, json: trialUsed ? { error: { code:'trial_used' } } : access ? { ready: state.ready, mode: hosted ? 'supabase-hosted' : 'local-development' } : { error: { code: 'access_required' } } });
    }
    assert.ok(new URL(request.url()).pathname.endsWith('/recognize'));
    assert.equal(request.method(), 'POST');
    if (!hosted) assert.equal(request.headers().authorization, `Bearer ${pairingToken}`);
    assert.equal(request.headers()['x-api-key'], undefined, 'Vendor authentication must not reach the app.');
    const payload = request.postDataJSON();
    assert.equal(payload.image.mimeType, 'image/jpeg');
    assert.ok(payload.image.base64.startsWith('/9j/'), 'Real capture must produce JPEG bytes.');
    assert.ok(payload.image.base64.length < 8 * 1024 * 1024);
    assert.ok(typeof payload.requestId === 'string' && payload.requestId.length > 0);
    state.requests.push({ requestId: payload.requestId, bytes: Buffer.from(payload.image.base64, 'base64').length, at: Date.now() });
    const candidates = state.candidates; const failed = state.fail;
    if (state.providerDelayMs) await new Promise(resolve => setTimeout(resolve, state.providerDelayMs));
    if (failed) return route.abort('failed');
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ candidates }) });
  });
  await context.addInitScript(plan => {
    if (!localStorage.getItem('chase.prototype.v1')) localStorage.setItem('chase.prototype.v1', JSON.stringify({ onboardingComplete: true, plan, trial: { successfulRecognitions: 0 }, items: [] }));
    globalThis.chaseMediaRequests = 0;
    globalThis.chaseMediaErrors = [];
    globalThis.syntheticCardStyle = 0;
    globalThis.cameraArtworkIndex = null;
    globalThis.cameraArtworkScale = 1;
    globalThis.chaseThumbnailDelayMs = 0;
    globalThis.chaseDelayedThumbnailCallbacks = 0;
    globalThis.chaseUploadEncodes = 0;
    globalThis.chaseReveals = [];
    const seenReveals = new WeakSet();
    new MutationObserver(() => {
      const element = document.querySelector('[data-testid="scan-card-reveal"]');
      if (!element || seenReveals.has(element)) return;
      seenReveals.add(element);
      const row = { label: element.getAttribute('aria-label') ?? '', bounds: null, artwork: null };
      globalThis.chaseReveals.push(row);
      setTimeout(() => {
        if (!element.isConnected) return;
        const bounds = element.getBoundingClientRect();
        row.bounds = { y: bounds.y, height: bounds.height };
        const artwork = element.querySelector('[role="img"], img[alt]');
        row.artwork = artwork?.getAttribute('aria-label') ?? artwork?.getAttribute('alt');
      }, 450);
    }).observe(document, { childList: true, subtree: true });
    // Delay asynchronous thumbnail processing rather than blocking JS. This
    // exercises the same slow-capture cadence seen on a warm physical device.
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      if (this.width === 768) globalThis.chaseUploadEncodes++;
      const delay = this.width === 64 && this.height === 88 ? globalThis.chaseThumbnailDelayMs : 0;
      return toBlob.call(this, blob => {
        if (!delay) { callback(blob); return; }
        globalThis.chaseDelayedThumbnailCallbacks++;
        setTimeout(() => callback(blob), delay);
      }, ...args);
    };
    // Controlled captured pixels exercise the real JPEG/manipulator/detector path.
    // The provider remains a fixture; these are not photographed/identified cards.
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      const result = draw.call(this, source, ...args);
      if (source?.tagName !== 'VIDEO') return result;
      if (globalThis.chaseFailCaptureOnce) { globalThis.chaseFailCaptureOnce = false; throw new Error('Synthetic camera failure'); }
      const style = globalThis.syntheticCardStyle;
      const w = this.canvas.width; const h = this.canvas.height;
      if (style !== -1 && globalThis.cameraArtworkIndex !== null && globalThis.chaseCameraArt?.[globalThis.cameraArtworkIndex]) {
        this.fillStyle = 'rgb(185,179,170)'; this.fillRect(0, 0, w, h);
        const cardWidth = w * 300 / 640 * globalThis.cameraArtworkScale;
        const cardHeight = h * 412 / 960 * globalThis.cameraArtworkScale;
        draw.call(this, globalThis.chaseCameraArt[globalThis.cameraArtworkIndex], (w - cardWidth) / 2, (h - cardHeight) / 2, cardWidth, cardHeight);
        return result;
      }
      if (!style) return result;
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
  page.setDefaultTimeout(30_000);
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) state.console.push(message.text()); });
  await page.goto(`${url}/scanner`);
  await button(page, trialUsed ? 'Explore Chase Pro' : ready && access ? 'Enable card scanning' : 'Retry connection').waitFor({ timeout: 60_000 });
  await button(page, 'Organize (0)').waitFor();
  return { page, context, state };
}

async function enable(page) {
  await button(page, 'Enable card scanning').click();
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.readyState >= 2));
}

try {
  if (hosted) {
    const guest = await fixture({ authenticated: false, plan: 'free' });
    await check('guest scanner connects automatically without registration and still waits for camera upload consent', async () => {
      await button(guest.page, 'Enable card scanning').waitFor();
      assert.equal(guest.state.requests.length, 0); assert.ok(guest.state.healthRequests >= 1);
      assert.equal(guest.state.guestSignUps,1);
      assert.equal(await guest.page.evaluate(() => globalThis.chaseMediaRequests), 0);
      await enable(guest.page); await button(guest.page, 'Organize (1)').waitFor({ timeout:30_000 });
      assert.equal(guest.state.requests.length,1); assert.equal(copies(await collection(guest.page)),0);
      await guest.page.goto(`${url}/scanner`); await button(guest.page, 'Organize (1)').waitFor();
      assert.equal(guest.state.guestSignUps,1, 'Reopening scanner must reuse its persisted guest.');
      assert.equal(guest.state.requests.length,1, 'Free scan is not refilled by navigation.');
      await guest.page.goto(`${url}/profile`); await guest.page.getByText('Guest collector',{ exact:true }).waitFor();
      await button(guest.page,'Create Account').waitFor();
    });
    await check('guest registration verifies email before password setup and preserves the UUID, pending scan and Free usage', async () => {
      const before = await stored(guest.page,'chase.auth.vzjekkgyrdxzlhaupnrw.v1');
      await button(guest.page,'Create Account').click();
      assert.equal(await guest.page.getByLabel('Password',{ exact:true }).count(),0);
      await guest.page.getByLabel('Email',{ exact:true }).fill(hostedUser.email);
      await button(guest.page,'Create Account').click();
      await guest.page.getByText('Check your email to verify your account and choose a password.',{ exact:true }).waitFor();
      assert.ok(guest.state.guestRedirect);
      const callback = new URL(guest.state.guestRedirect); callback.searchParams.set('code','valid-guest-upgrade-code');
      await guest.page.goto(callback.href);
      await button(guest.page,'Update password').waitFor();
      await guest.page.getByLabel('Password',{ exact:true }).fill('verified-guest-password');
      await button(guest.page,'Update password').click();
      await guest.page.getByText('Password updated.',{ exact:true }).waitFor();
      const after = await stored(guest.page,'chase.auth.vzjekkgyrdxzlhaupnrw.v1');
      assert.equal(after.user.id,before.user.id); assert.equal(after.user.is_anonymous,false);
      assert.equal(guest.state.guestSignUps,1); assert.equal(guest.state.requests.length,1);
      assert.equal(copies(await pending(guest.page)),1); assert.equal(copies(await collection(guest.page)),0);
      assert.equal((await collection(guest.page)).trial.successfulRecognitions,1);
    });
    await guest.context.close();
    const exhausted = await fixture({ trialUsed:true });
    await check('server Free limit cannot be bypassed by local development Pro simulation', async () => {
      await exhausted.page.getByText('Your free scan has been used. Your pending cards are still in Organize.',{ exact:true }).waitFor();
      assert.equal(exhausted.state.requests.length,0); assert.equal(await exhausted.page.evaluate(() => globalThis.chaseMediaRequests),0);
    });
    await exhausted.context.close();
    const ungranted = await fixture({ access: false });
    await check('server revocation remains effective despite local Pro simulation', async () => {
      await ungranted.page.getByText('Scanning is unavailable for this session. Contact support.', { exact: true }).waitFor();
      assert.equal(ungranted.state.requests.length, 0); assert.equal(await ungranted.page.evaluate(() => globalThis.chaseMediaRequests), 0);
      assert.equal(copies(await collection(ungranted.page)), 0);
    });
    await ungranted.context.close();
  }
  if (!focus) {
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
    const feedback = await recordedReveal(page, 1);
    assert.match(feedback.label, /Recognized Charizard\. 1 pending cards\./);
    assert.equal(feedback.artwork, 'Charizard, Base Set, 4/102, Pokémon TCG card');
    assert.equal(await page.getByText('Added to session', { exact: true }).count(), 0, 'The old recognition popup must be replaced.');
    await assertFullCamera(page);
    await assertCleanLiveControls(page);
    // The card enters from below with pointerEvents=none. Check its settled
    // placement above the action, rather than its intentional entrance path.
    const organize = await button(page, 'Organize (1)').boundingBox();
    const art = feedback.bounds;
    assert.ok(organize && art && art.y + art.height <= organize.y + 1, 'The animated card must leave Organize unobstructed.');
    assert.equal(state.requests.length, 1);
    assert.ok(state.candidates.every(candidate => !candidate.tcgdexId), 'Ordinary CardSight fixtures must not inject canonical catalog identity.');
    assert.ok(state.catalogState.requests.some(value => new URL(value).pathname.endsWith('/sets')));
    assert.ok(state.catalogState.requests.some(value => new URL(value).pathname.endsWith('/sets/base1')));
    assert.equal(new URL(page.url()).pathname, '/scanner');
    assert.equal((await pending(page)).items[0].cardId, 'tcgdex:en:base1-4:holo');
    assert.equal(copies(await collection(page)), 0);
    await page.screenshot({ path: '/tmp/chase-live-scanner-result.png' });
  });
  await check('stationary camera card remains one recognition while preview continues', async () => {
    await button(page, 'Turn flashlight on').click();
    await page.getByText('Flashlight is available in the Android and iOS app.', { exact: true }).waitFor();
    assert.equal(await button(page, 'Turn flashlight off').count(), 0, 'Browser feedback must not claim to have switched on a hardware torch.');
    const uploadEncodes = await page.evaluate(() => globalThis.chaseUploadEncodes);
    assert.ok(uploadEncodes >= 2, 'Useful identification must exercise full upload-image encoding.');
    await page.waitForTimeout(3500);
    assert.equal(await page.evaluate(() => globalThis.chaseUploadEncodes), uploadEncodes, 'Held-card observations must not repeatedly resize and encode full upload images.');
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
    await enable(page); await button(page, 'Organize (1)').waitFor();
    assert.match((await recordedReveal(page, 1)).label, /Recognized Charizard\. 1 pending cards\./);
    await page.waitForTimeout(2200);
    assert.equal(await reveal(page).count(), 0, 'The reveal must not remain over the live guides indefinitely.');
    await page.evaluate(() => { globalThis.syntheticCardStyle = -1; }); await page.waitForTimeout(2200);
    await page.evaluate(() => { globalThis.syntheticCardStyle = 0; });
    await button(page, 'Organize (2)').waitFor();
    assert.match((await recordedReveal(page, 2)).label, /Recognized Charizard\. 2 pending cards\./);
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
    state.candidates = [greninja];
    await page.evaluate(() => { globalThis.syntheticCardStyle = 1; });
    await button(page, 'Organize (2)').waitFor();
    assert.equal(state.requests.length, 2);
  });
  await mountRecovery.context.close();
  }

  if (!focus || focus === 'appearance') {
  const verification = await fixture();
  await check('a changed appearance of the same provider printing is verified once without adding a duplicate copy', async () => {
    const { page, state } = verification;
    await loadCameraArtwork(page); await presentArtwork(page, 0); await enable(page);
    await button(page, 'Organize (1)').waitFor();
    // The local pixels change substantially, but CardSight still says Charizard:
    // this simulates a sleeve/reflection/crop change rather than another copy.
    await presentArtwork(page, 1);
    const verificationDeadline = Date.now() + 10_000;
    while (state.requests.length < 2 && Date.now() < verificationDeadline) await page.waitForTimeout(100);
    assert.equal(state.requests.length, 2, 'A clearly changed stable image gets a bounded verification attempt.');
    await page.waitForTimeout(2500);
    assert.equal(copies(await pending(page)), 1, 'Verification of the same printing must not stage before the guard runs.');
    assert.equal((await pending(page)).items[0].quantity, 1);
    assert.equal(state.requests.length, 2, 'The verified appearance must then remain locked.');
    await page.evaluate(() => { globalThis.syntheticCardStyle = -1; });
    await page.waitForTimeout(2200);
    await presentArtwork(page, 0);
    await button(page, 'Organize (2)').waitFor({ timeout: 10_000 });
    assert.equal(state.requests.length, 3, 'Confirmed removal allows a deliberate second physical copy of the same printing.');
    assert.equal((await pending(page)).items.length, 1);
    assert.equal((await pending(page)).items[0].quantity, 2);
    assert.equal(copies(await collection(page)), 0);
  });
  await verification.context.close();

  const finishVerification = await fixture({ candidates: [{ ...pikachu, finish: 'normal' }] });
  await check('changing finish evidence on one held printing reviews its original row instead of adding another copy', async () => {
    const { page, state } = finishVerification;
    await loadCameraArtwork(page); await presentArtwork(page, 0); await enable(page);
    await button(page, 'Organize (1)').waitFor();
    assert.equal((await pending(page)).items[0].cardId, 'tcgdex:en:xy12-35:normal');
    state.candidates = [{ ...pikachu, finish: 'reverse' }];
    await presentArtwork(page, 1);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('chase.scan-session.v1')).items[0].ambiguity === 'review');
    const reviewed = await pending(page);
    assert.equal(copies(reviewed), 1); assert.equal(reviewed.items.length, 1);
    assert.equal(reviewed.items[0].cardId, 'tcgdex:en:xy12-35:normal');
    assert.equal(reviewed.items[0].price, null); assert.equal(state.requests.length, 2);
    await button(page, 'Organize (1)').click();
    await button(page, 'Review Pikachu variant').waitFor();
    assert.equal(copies(await collection(page)), 0);
  });
  await finishVerification.context.close();
  }

  if (!focus || focus === 'diagnostics') {
  const diagnostic = await fixture();
  await check('scanner diagnostics expose bounded scalar capture reasons without photos, credentials or changing the session', async () => {
    const { page, state } = diagnostic;
    await enable(page); await button(page, 'Organize (1)').waitFor();
    await button(page, /Show scanner diagnostics$/).click();
    await page.getByText('Scanner diagnostics', { exact: true }).waitFor();
    const report = await page.getByText(/^Chase scanner diagnostics v2/).innerText();
    assert.match(report, /"captureMs":/);
    assert.match(report, /"analysisMs":/);
    assert.match(report, /"reason":/);
    assert.doesNotMatch(report, /data:image|\/9j\/|https?:\/\/|Authorization|Bearer|EXPO_PUBLIC|signature/i);
    assert.ok(!report.includes(pairingToken));
    await button(page, 'Refresh diagnostics').click();
    await button(page, 'Close diagnostics').click();
    await button(page, 'Organize (1)').waitFor();
    await page.waitForTimeout(1500);
    assert.equal(state.requests.length, 1);
    assert.equal(copies(await pending(page)), 1);
    assert.equal(copies(await collection(page)), 0);
    await assertFullCamera(page);
  });
  await diagnostic.context.close();
  }

  if (!focus || focus === 'catalog') {
  const boundedCatalog = await fixture({ catalogDelayMs: 6000 });
  await check('catalog deadline retains recognized metadata and releases the scanner for another printing', async () => {
    const { page, state } = boundedCatalog;
    await enable(page); await button(page, 'Organize (1)').waitFor({ timeout: 15_000 });
    assert.equal((await pending(page)).items.length, 0);
    assert.equal((await pending(page)).unresolved.length, 1);
    state.catalogDelayMs = 0; state.candidates = [greninja];
    await page.evaluate(() => { globalThis.syntheticCardStyle = 1; });
    await button(page, 'Organize (2)').waitFor({ timeout: 20_000 });
    assert.equal(state.requests.length, 2);
    assert.equal((await pending(page)).items[0].cardId, 'tcgdex:en:sv6-214:holo');
    assert.equal((await pending(page)).unresolved.length, 1, 'The late first lookup must not silently save or discard the unmatched identification.');
    assert.equal(copies(await collection(page)), 0);
  });
  await boundedCatalog.context.close();
  }

  if (!focus || focus === 'slow') {
  const slowCapture = await fixture({ catalogDelayMs: 120 });
  await check('slower than2.2s thumbnail captures continue past the first card and preserve held-card deduplication', async () => {
    const { page, state } = slowCapture;
    await loadCameraArtwork(page); await presentArtwork(page, 0); await enable(page);
    await button(page, 'Organize (1)').waitFor();
    await page.evaluate(() => { globalThis.chaseThumbnailDelayMs = 1150; });
    for (let index = 1; index <= 3; index++) {
      state.candidates = [artworkPool[index][1]];
      await presentArtwork(page, index);
      await button(page, `Organize (${index + 1})`).waitFor({ timeout: 25_000 });
    }
    await page.waitForTimeout(4000);
    assert.equal(state.requests.length, 4, 'Slow processing must neither reset every stability sample nor repeatedly upload held art.');
    assert.ok(await page.evaluate(() => globalThis.chaseDelayedThumbnailCallbacks >= 8), 'The real asynchronous thumbnail path must have been delayed.');
    assert.equal(copies(await pending(page)), 4);
    assert.equal(copies(await collection(page)), 0);
    await assertFullCamera(page);
  });
  await slowCapture.context.close();
  }

  if (!focus || focus === 'during') {
  const duringIdentification = await fixture({ providerDelayMs: 6000 });
  await check('local analysis sees removal during a provider request and accepts a second physical copy automatically', async () => {
    const { page, state } = duringIdentification;
    await enable(page);
    await page.waitForFunction(() => document.querySelector('[data-testid="live-scanner-preview"] video')?.readyState >= 2);
    const firstRequestDeadline = Date.now() + 15_000;
    while (!state.requests.length && Date.now() < firstRequestDeadline) await page.waitForTimeout(100);
    assert.equal(state.requests.length, 1, 'The first recognition must start before testing in-flight removal.');
    await page.evaluate(() => { globalThis.syntheticCardStyle = -1; });
    await page.waitForTimeout(2200);
    await page.evaluate(() => { globalThis.syntheticCardStyle = 0; });
    await button(page, 'Organize (2)').waitFor({ timeout: 25_000 });
    assert.equal(state.requests.length, 2);
    assert.equal((await pending(page)).items.length, 1);
    assert.equal((await pending(page)).items[0].quantity, 2);
    await page.waitForTimeout(2500);
    assert.equal(state.requests.length, 2, 'The re-presented physical copy remains locked after its result.');
  });
  await duringIdentification.context.close();
  }

  if (!focus || focus === 'art') {
  const continuous = await fixture({ catalogDelayMs: 120 });
  await check('twenty actual-art presentations resolve opaque provider identities through cold sets and stay continuous across failures and Organize', async () => {
    const { page, state } = continuous;
    const pool = artworkPool.map(([, candidate]) => candidate);
    await loadCameraArtwork(page); await presentArtwork(page, 0);
    await enable(page);
    let good = 0;
    const responseTimes = [];
    for (let index = 0; index < 20; index++) {
      if (process.env.CHASE_LIVE_PROGRESS) console.log(`Presentation ${index + 1}/20; pending ${good}; proxy requests ${state.requests.length}`);
      state.candidates = [pool[index % pool.length]]; state.fail = index === 4;
      const presentedAt = Date.now();
      await presentArtwork(page, index % pool.length, index % 3 === 0 ? 0.75 : index % 3 === 1 ? 1.27 : 1);
      if (state.fail) {
        await page.getByText(/Could not reach the scanner or catalog/).waitFor();
        const count = state.requests.length;
        await page.waitForTimeout(2600); assert.equal(state.requests.length, count, 'Holding a failed card must not retry automatically.');
        await assertCleanLiveControls(page);
      } else {
        good++; await button(page, `Organize (${good})`).waitFor({ timeout: 8000 });
        responseTimes.push(Date.now() - presentedAt);
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
    await page.evaluate(() => { globalThis.syntheticCardStyle = 0; });
    await presentArtwork(page, 1);
    await button(page, 'Organize (20)').waitFor({ timeout: 25_000 });
    assert.equal(state.requests.length, 21); assert.equal(copies(await pending(page)), 20);
    console.log(`Actual-art recognition feedback times (ms): ${JSON.stringify(responseTimes)}`);
    assert.equal((await collection(page)).items.length, 0);
    await button(page, 'Organize (20)').click(); await button(page, 'Save all to Collection').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('chase.prototype.v1')).items.reduce((sum, item) => sum + item.quantity, 0) === 20);
    await page.screenshot({ path: '/tmp/chase-continuous-session-verified.png' });
  });
  await continuous.context.close();
  }

  assert.ok(passed > 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(forbiddenRequests, []);
  console.log(`Live scanner passed: ${passed} browser scenarios, no runtime errors or vendor calls. Recognition responses are Chase protocol fixtures, not real CardSight validation. Backend: ${hosted ? 'hosted fixture' : 'local fixture'}. Focus: ${focus ?? 'all'}.`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: '/tmp/chase-live-scanner-failure.png' }).catch(() => {});
    console.error((await activePage.locator('body').innerText()).slice(-2500));
    const diagnosticControl = button(activePage, /Show scanner diagnostics$/).first();
    if (await diagnosticControl.isVisible().catch(() => false)) {
      await diagnosticControl.click({ timeout: 2000 }).catch(() => {});
      const trace = await activePage.getByText(/^Chase scanner diagnostics v2/).innerText({ timeout: 2000 }).catch(() => null);
      if (trace) console.error('Scanner scalar trace:', trace);
    }
    console.error('Fixture diagnostics:', JSON.stringify({ proxyRequests: activeState?.requests.length, console: activeState?.console.slice(-8),
      camera: await activePage.evaluate(() => ({ requests: globalThis.chaseMediaRequests, failures: globalThis.chaseMediaErrors, videos: document.querySelectorAll('video').length, uploadEncodes: globalThis.chaseUploadEncodes, slowThumbnailCallbacks: globalThis.chaseDelayedThumbnailCallbacks })).catch(() => null) }));
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
