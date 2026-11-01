import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { chromium } from 'playwright-core';
import { installTCGdexFixtures } from './fixtures/tcgdex.mjs';
import { collectionFixtures } from './fixtures/collections.mjs';

const url = process.env.CHASE_SMOKE_URL ?? 'http://localhost:8085';
const browser = await chromium.launch({ executablePath: process.env.CHASE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = []; let passed = 0;
const button = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const check = async (name, run) => { await run(); console.log(`PASS ${++passed}: ${name}`); };
const seed = { onboardingComplete: true, plan: 'free', trial: { successfulRecognitions: 0 }, items: [{ cardId: 'base1-4', quantity: 2, addedAt: '2026-10-21T00:00:00.000Z' }] };
const pendingSeed = { version: 1, id: 'auth-pending-fixture', freeRecognitionUsed: false, items: [{ id: 'pending-copy', operationId: 'pending-operation', cardId: 'base1-4', name: 'Charizard', imageKey: 'charizard', setName: 'Base Set', collectorNumber: '4/102', variant: 'Holo', quantity: 3, identifiedAt: '2026-10-21T00:00:00.000Z', ambiguity: 'review', priceState: 'unavailable', price: null }] };
const user = { id: '12345678-1234-1234-1234-123456789abc', aud: 'authenticated', role: 'authenticated', email: 'collector@example.com', created_at: '2026-10-21T00:00:00Z', user_metadata: {}, app_metadata: {}, identities: [] };
const token = () => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' })).toString('base64url'), 'fixture-signature'].join('.');
async function fixture(guest = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const collections = collectionFixtures();
  const state = { calls: [], offline: false, oauth: 'success', pkce: [], user: { ...user, is_anonymous: guest } };
  await installTCGdexFixtures(context);
  await context.route('https://*.supabase.co/**', async route => {
    const request = route.request(); const parsed = new URL(request.url()); state.calls.push(parsed.pathname);
    if (state.offline) return route.abort('failed');
    if (parsed.pathname.endsWith('/authorize') && !parsed.pathname.includes('/identities/')) {
      assert.equal(parsed.searchParams.get('provider'), 'google');
      assert.ok(parsed.searchParams.get('code_challenge'));
      const callback = new URL(parsed.searchParams.get('redirect_to'));
      if (state.oauth === 'success') { state.user = { ...user, is_anonymous: false }; callback.searchParams.set('code', 'fixture-google-code-123456'); }
      else { callback.hash = `error_code=${state.oauth}&error_description=private-upstream-description`; }
      return route.fulfill({ status: 302, headers: { location: callback.href } });
    }
    assert.ok(request.headers().apikey?.startsWith('sb_publishable_'), 'Only a public project key may reach the client.');
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'x-supabase-api-version', 'x-supabase-api-version': '2024-01-01' };
    if (await collections.handle(route, state.user, headers)) return;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (parsed.pathname.endsWith('/user/identities/authorize')) {
      assert.ok(request.headers().authorization?.startsWith('Bearer '));
      return route.fulfill({ headers, json: { url: `${parsed.origin}/auth/v1/authorize?${parsed.searchParams}` } });
    }
    if (parsed.pathname.endsWith('/token')) {
      assert.equal(parsed.searchParams.get('grant_type'), 'pkce', 'Password authentication must never be requested.');
      if (parsed.searchParams.get('grant_type') === 'pkce') state.pkce.push(request.postDataJSON());
      return route.fulfill({ headers, json: { access_token: token(), token_type: 'bearer', expires_in: 3600, refresh_token: 'fixture-refresh', user: state.user } });
    }
    if (parsed.pathname.endsWith('/user')) return route.fulfill({ headers, json: state.user });
    if (parsed.pathname.endsWith('/logout')) return route.fulfill({ status: 204, headers });
    throw new Error(`Unexpected fixture endpoint: ${parsed.pathname}`);
  });
  await context.addInitScript(({ seed, pendingSeed }) => {
    if (!localStorage.getItem('chase.prototype.v1')) localStorage.setItem('chase.prototype.v1', JSON.stringify(seed));
    if (!localStorage.getItem('chase.scan-session.v1')) localStorage.setItem('chase.scan-session.v1', JSON.stringify(pendingSeed));
  }, { seed, pendingSeed });
  if (guest) await context.addInitScript(({ token, user }) => {
    const key = 'chase.auth.vzjekkgyrdxzlhaupnrw.v1';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'guest-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }));
  }, { token: token(), user: state.user });
  const page = await context.newPage(); page.setDefaultTimeout(25_000); page.on('pageerror', error => errors.push(error.message));
  const stored = () => page.evaluate(() => { const { collectionSync, ...guest } = JSON.parse(localStorage.getItem('chase.prototype.v1')); return guest; });
  return { page, context, state, stored };
}
async function socialOnly(page) {
  await button(page, 'Continue with Google').waitFor();
  await button(page, 'Continue with Apple').waitFor();
  await page.getByTestId('startup-splash').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('textbox').count(), 0, 'No email/password input may remain.');
  assert.equal(await page.getByLabel('Password', { exact: true }).count(), 0);
  for (const name of ['Forgot password?', 'Send reset link', 'Update password', 'Show password', 'Request reset link']) assert.equal(await button(page, name).count(), 0);
  assert.equal(await page.getByText('or continue with email', { exact: true }).count(), 0);
}
let active;
try {
  const run = await fixture(); active = run.page;
  const { page, state } = run;
  await check('guest collection is available without authentication or Supabase network calls', async () => {
    await page.goto(`${url}/profile`); await button(page, 'Sign In').waitFor();
    assert.equal(state.calls.length, 0); assert.deepEqual(await run.stored(), seed);
  });
  await check('Sign In and Create Account expose only Google and Apple and never request email credentials', async () => {
    for (const name of ['Create Account', 'Sign In']) {
      await button(page, name).click(); await socialOnly(page);
      await button(page, 'Continue with Apple').click();
      await page.getByText('Continue with Apple is not available yet.', { exact: true }).waitFor();
      await button(page, 'Continue to Chase').click(); await button(page, 'Sign In').waitFor();
    }
    assert.equal(state.calls.length, 0); assert.deepEqual(await run.stored(), seed);
  });
  await check('old password screens resolve to social sign-in and old email callbacks cannot exchange a code', async () => {
    for (const section of ['forgot', 'reset']) {
      await page.goto(`${url}/account?section=${section}`); await socialOnly(page);
    }
    for (const callback of ['?code=legacy-email-verification-code', '?code=legacy-recovery-code&type=recovery', '?provider=email&code=legacy-email-code']) {
      await page.goto(`${url}/auth/callback${callback}`);
      await page.getByText('This sign-in link is no longer supported. Continue with Google or as a guest.', { exact: true }).waitFor();
      await button(page, 'Sign In').click(); await socialOnly(page);
    }
    assert.equal(state.calls.length, 0); assert.equal(state.pkce.length, 0);
    assert.deepEqual(await run.stored(), seed);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('chase.scan-session.v1'))), pendingSeed);
  });
  await check('social sign-in fits narrow screens with guest access available', async () => {
    await page.setViewportSize({ width: 320, height: 568 }); await page.goto(`${url}/account?section=signin`);
    await socialOnly(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: '/tmp/chase-social-signin.png', fullPage: true });
    await button(page, 'Continue to Chase').click(); await button(page, 'Sign In').waitFor();
  });
  await run.context.close();
  await check('Google sign-in returns through PKCE, restores on reload and preserves the collection and pending scans', async () => {
    const google = await fixture(); active = google.page;
    await google.page.goto(`${url}/account?section=signin`);
    await button(google.page, 'Continue with Google').click();
    await google.page.getByText(user.email, { exact: true }).filter({ visible: true }).waitFor();
    assert.equal(google.state.pkce.length, 1); assert.ok(google.state.pkce[0].code_verifier);
    assert.deepEqual(await google.stored(), seed);
    assert.deepEqual(await google.page.evaluate(() => JSON.parse(localStorage.getItem('chase.scan-session.v1'))), pendingSeed);
    await google.page.reload(); await google.page.getByText(user.email, { exact: true }).filter({ visible: true }).waitFor();
    assert.ok(google.state.calls.includes('/auth/v1/user'));
    await button(google.page, 'Log Out').click();
    await google.page.getByText('Your collection and pending scans stay on this device.', { exact: true }).waitFor();
    await button(google.page, 'Log Out').click(); await button(google.page, 'Sign In').waitFor();
    assert.deepEqual(await google.stored(), seed);
    assert.deepEqual(await google.page.evaluate(() => JSON.parse(localStorage.getItem('chase.scan-session.v1'))), pendingSeed);
    await google.context.close();
  });
  await check('Create Account with Google upgrades an existing scanner guest through identity linking', async () => {
    const google = await fixture(true); active = google.page;
    await google.page.goto(`${url}/account?section=create`);
    await button(google.page, 'Continue with Google').click();
    await google.page.getByText(user.email, { exact: true }).filter({ visible: true }).waitFor();
    assert.equal(google.state.calls.filter(path => path === '/auth/v1/user/identities/authorize').length, 1);
    assert.equal(google.state.pkce.length, 1); assert.deepEqual(await google.stored(), seed);
    assert.deepEqual(await google.page.evaluate(() => JSON.parse(localStorage.getItem('chase.scan-session.v1'))), pendingSeed);
    await google.context.close();
  });
  await check('Google access denial shows a safe recoverable error and guest navigation still works', async () => {
    const google = await fixture(); active = google.page; google.state.oauth = 'access_denied';
    await google.page.goto(`${url}/account?section=signin`); await button(google.page, 'Continue with Google').click();
    await google.page.getByText('Google sign-in was canceled. You can try again or continue as a guest.', { exact: true }).waitFor();
    assert.ok(!(await google.page.locator('body').innerText()).includes('private-upstream'));
    assert.equal(google.state.pkce.length, 0); assert.deepEqual(await google.stored(), seed);
    await button(google.page, 'Continue to Chase').click(); await button(google.page, 'Sign In').waitFor();
    google.state.oauth = 'success'; await button(google.page, 'Sign In').click(); await button(google.page, 'Continue with Google').click();
    await google.page.getByText(user.email, { exact: true }).filter({ visible: true }).waitFor();
    await google.context.close();
  });
  await check('a Google account already linked elsewhere offers explicit existing-account sign-in', async () => {
    const google = await fixture(true); active = google.page; google.state.oauth = 'identity_already_exists';
    await google.page.goto(`${url}/account?section=signin`); await button(google.page, 'Continue with Google').click();
    await button(google.page, 'Use existing Google account').waitFor(); assert.equal(google.state.pkce.length, 0);
    google.state.oauth = 'success'; await button(google.page, 'Use existing Google account').click();
    await google.page.getByText(user.email, { exact: true }).filter({ visible: true }).waitFor();
    assert.equal(google.state.calls.filter(path => path === '/auth/v1/user/identities/authorize').length, 1);
    assert.equal(google.state.pkce.length, 1); assert.deepEqual(await google.stored(), seed);
    await google.context.close();
  });
  await check('OAuth errors for a disabled provider and invalid callbacks never display an authenticated identity', async () => {
    const google = await fixture(); active = google.page; google.state.oauth = 'provider_disabled';
    await google.page.goto(`${url}/account?section=signin`); await button(google.page, 'Continue with Google').click();
    await google.page.getByText('Google sign-in is not enabled correctly in Supabase yet. You can continue as a guest.', { exact: true }).waitFor();
    await google.page.goto(`${url}/auth/callback?provider=google&code=invalid`);
    await google.page.getByText('Google sign-in could not be verified. Return to Sign In and try again on this device.', { exact: true }).waitFor();
    assert.equal(google.state.pkce.length, 0); assert.deepEqual(await google.stored(), seed);
    await google.context.close();
  });
  await check('Apple remains an honest placeholder; Google linking network failures leave guest access available', async () => {
    const google = await fixture(true); active = google.page;
    await google.page.goto(`${url}/account?section=signin`); await button(google.page, 'Continue with Apple').click();
    await google.page.getByText('Continue with Apple is not available yet.', { exact: true }).waitFor();
    google.state.offline = true; await button(google.page, 'Continue with Google').click();
    await google.page.getByText('Could not connect to your account. Check your connection and try again.', { exact: true }).waitFor();
    assert.deepEqual(await google.stored(), seed);
    await button(google.page, 'Continue to Chase').click();
    await google.page.getByText('Guest collector', { exact: true }).filter({ visible: true }).waitFor();
    await google.context.close();
  });
  assert.deepEqual(errors, []); console.log(`Account workflow passed: ${passed} scenarios. Supabase responses are fixtures; no live accounts or emails were created.`);
} catch (error) {
  if (active && !active.isClosed()) { await active.screenshot({ path: '/tmp/chase-auth-failure.png' }).catch(() => {}); console.error((await active.locator('body').innerText()).slice(-2000)); }
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
