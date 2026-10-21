import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { chromium } from 'playwright-core';
import { installTCGdexFixtures } from './fixtures/tcgdex.mjs';

const url = process.env.CHASE_SMOKE_URL ?? 'http://localhost:8085';
const browser = await chromium.launch({ executablePath: process.env.CHASE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = []; let passed = 0;
const button = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const check = async (name, run) => { await run(); console.log(`PASS ${++passed}: ${name}`); };
const seed = { onboardingComplete: true, plan: 'free', trial: { successfulRecognitions: 0 }, items: [{ cardId: 'base1-4', quantity: 2, addedAt: '2026-10-21T00:00:00.000Z' }] };
const pendingSeed = { version: 1, id: 'auth-pending-fixture', freeRecognitionUsed: false, items: [{ id: 'pending-copy', operationId: 'pending-operation', cardId: 'base1-4', name: 'Charizard', imageKey: 'charizard', setName: 'Base Set', collectorNumber: '4/102', variant: 'Holo', quantity: 3, identifiedAt: '2026-10-21T00:00:00.000Z', ambiguity: 'review', priceState: 'unavailable', price: null }] };
const user = { id: '12345678-1234-1234-1234-123456789abc', aud: 'authenticated', role: 'authenticated', email: 'collector@example.com', created_at: '2026-10-21T00:00:00Z', user_metadata: {}, app_metadata: {}, identities: [] };
const token = () => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' })).toString('base64url'), 'fixture-signature'].join('.');
async function fixture() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const state = { calls: [], invalid: false, offline: false, confirm: true };
  await installTCGdexFixtures(context);
  await context.route('https://*.supabase.co/**', async route => {
    const request = route.request(); const parsed = new URL(request.url()); state.calls.push(parsed.pathname);
    if (state.offline) return route.abort('failed');
    assert.ok(request.headers().apikey?.startsWith('sb_publishable_'), 'Only a public project key may reach the client.');
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'x-supabase-api-version', 'x-supabase-api-version': '2024-01-01' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (state.invalid) return route.fulfill({ status: 400, headers, json: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    if (parsed.pathname.endsWith('/signup') && state.confirm) return route.fulfill({ headers, json: user });
    if (parsed.pathname.endsWith('/token') || parsed.pathname.endsWith('/signup')) return route.fulfill({ headers, json: { access_token: token(), token_type: 'bearer', expires_in: 3600, refresh_token: 'fixture-refresh', user } });
    if (parsed.pathname.endsWith('/user')) return route.fulfill({ headers, json: user });
    if (parsed.pathname.endsWith('/logout')) return route.fulfill({ status: 204, headers });
    if (parsed.pathname.endsWith('/recover')) return route.fulfill({ headers, json: {} });
    throw new Error(`Unexpected fixture endpoint: ${parsed.pathname}`);
  });
  await context.addInitScript(({ seed, pendingSeed }) => {
    if (!localStorage.getItem('chase.prototype.v1')) localStorage.setItem('chase.prototype.v1', JSON.stringify(seed));
    if (!localStorage.getItem('chase.scan-session.v1')) localStorage.setItem('chase.scan-session.v1', JSON.stringify(pendingSeed));
  }, { seed, pendingSeed });
  const page = await context.newPage(); page.setDefaultTimeout(25_000); page.on('pageerror', error => errors.push(error.message));
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('chase.prototype.v1')));
  return { page, context, state, stored };
}
async function fields(page, password = 'valid-password') {
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
}
let active;
try {
  const run = await fixture(); active = run.page;
  const { page, state } = run;
  await check('guest collection is available without authentication or Supabase network calls', async () => {
    await page.goto(`${url}/profile`); await button(page, 'Sign In').waitFor();
    assert.equal(state.calls.length, 0); assert.deepEqual(await run.stored(), seed);
  });
  await check('registration validates input and email confirmation never grants a signed-in identity', async () => {
    await button(page, 'Create Account').click(); await button(page, 'Create Account').click();
    await page.getByText('Enter a valid email address.', { exact: true }).waitFor(); assert.equal(state.calls.length, 0);
    await fields(page); await button(page, 'Create Account').click();
    await page.getByText('Check your email to confirm your account, then sign in.', { exact: true }).waitFor();
    await button(page, 'Continue to Chase').click(); await page.getByText('Guest collector', { exact: true }).filter({ visible: true }).waitFor();
    assert.deepEqual(await run.stored(), seed);
  });
  await check('invalid login is recoverable, then a verified account appears without changing ownership or Pro access', async () => {
    state.invalid = true; await button(page, 'Sign In').click(); await fields(page, 'wrong-password'); await button(page, 'Sign In').click();
    await page.getByText('Email or password is incorrect.', { exact: true }).waitFor();
    state.invalid = false; await fields(page); await button(page, 'Sign In').click();
    await page.getByText(user.email, { exact: true }).filter({ visible: true }).waitFor(); await button(page, 'Log Out').waitFor();
    assert.deepEqual(await run.stored(), seed); assert.ok(state.calls.includes('/auth/v1/user'));
  });
  await check('reload restores a server-verified session and local logout preserves collection and pending scans', async () => {
    await page.reload(); await page.getByText(user.email, { exact: true }).filter({ visible: true }).waitFor();
    const pendingBefore = await page.evaluate(() => localStorage.getItem('chase.scan-session.v1'));
    assert.deepEqual(JSON.parse(pendingBefore), pendingSeed, 'Actual pending copies must survive account creation, sign-in and reload.');
    await button(page, 'Log Out').click(); await page.getByText('Your collection and pending scans stay on this device.', { exact: true }).waitFor(); await button(page, 'Log Out').click();
    await button(page, 'Sign In').waitFor(); assert.deepEqual(await run.stored(), seed);
    assert.equal(await page.evaluate(() => localStorage.getItem('chase.scan-session.v1')), pendingBefore);
  });
  await check('password recovery requests are explicit and a guest cannot update an account password', async () => {
    await button(page, 'Sign In').click(); await button(page, 'Forgot password?').click();
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email); await button(page, 'Send reset link').click();
    await page.getByText('If an account exists for this email, you will receive a reset link. Open it on this device.', { exact: true }).waitFor();
    await page.goto(`${url}/account?section=reset`); await page.getByText('Open a password reset link on this device first.', { exact: true }).waitFor();
    assert.deepEqual(await run.stored(), seed);
  });
  await check('narrow authentication layout supports labels and leaves guest access available', async () => {
    await page.setViewportSize({ width: 320, height: 568 }); await page.goto(`${url}/account?section=signin`);
    await page.getByRole('textbox', { name: 'Email', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: '/tmp/chase-account-signin.png', fullPage: true });
    await button(page, 'Continue to Chase').click(); await button(page, 'Sign In').waitFor();
  });
  await run.context.close();
  assert.deepEqual(errors, []); console.log(`Account workflow passed: ${passed} scenarios. Supabase responses are fixtures; no live accounts or emails were created.`);
} catch (error) {
  if (active && !active.isClosed()) { await active.screenshot({ path: '/tmp/chase-auth-failure.png' }).catch(() => {}); console.error((await active.locator('body').innerText()).slice(-2000)); }
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
