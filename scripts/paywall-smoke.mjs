import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.CHASE_SMOKE_URL ?? 'http://localhost:8085';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname), 'Use a local fixture server.');
const browser = await chromium.launch({
  executablePath: process.env.CHASE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const storageKey = 'chase.prototype.v1', pendingKey = 'chase.scan-session.v1';
const seed = { onboardingComplete: true, plan: 'free', trial: { successfulRecognitions: 1 }, items: [{ cardId: 'base1-4', quantity: 2, addedAt: '2026-11-01T00:00:00.000Z' }] };
const pending = { version: 1, id: 'pro-test-pending', freeRecognitionUsed: true, items: [{ id: 'pending-card', operationId: 'pro-pending-operation', cardId: 'base1-4', name: 'Charizard', imageKey: 'charizard', setName: 'Base Set', collectorNumber: '4/102', variant: 'Holo', quantity: 3, identifiedAt: '2026-11-01T00:00:00.000Z', ambiguity: 'confirmed', priceState: 'available', price: { amount: 245, currency: 'USD', source: 'mock', updatedAt: '2026-10-01T00:00:00.000Z' } }] };
const errors = [], contexts = [];
let passed = 0;
const button = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const text = (page, value) => page.getByText(value, { exact: true }).filter({ visible: true });
const check = async (name, run) => { await run(); console.log(`PASS ${++passed}: ${name}`); };
async function fixture(width = 390, height = 844, currency = 'USD') {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' }); contexts.push(context);
  // This suite uses only bundled hero art and local state; no real provider or account requests.
  await context.route('https://**/*', route => route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, json: { error: { code: 'fixture_unavailable' } } }));
  await context.addInitScript(({ seed, pending, storageKey, pendingKey, currency }) => {
    if (!localStorage.getItem('pro-fixture-initialized')) {
      localStorage.setItem('pro-fixture-initialized', '1');
      localStorage.setItem(storageKey, JSON.stringify(seed)); localStorage.setItem(pendingKey, JSON.stringify(pending));
      localStorage.setItem('chase.currency.v1', currency);
    }
  }, { seed, pending, storageKey, pendingKey, currency });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
  return { page, context };
}
async function go(page, suffix = '/paywall') {
  await page.goto(new URL(suffix, baseUrl).href);
  await button(page, suffix.includes('returnTo=') ? 'Close Chase Pro and return' : 'Close Chase Pro and go to Home').waitFor();
  await page.getByTestId('startup-splash').waitFor({ state: 'detached' });
}
async function state(page) {
  return page.evaluate(({ storageKey, pendingKey }) => ({ collection: JSON.parse(localStorage.getItem(storageKey)), pending: JSON.parse(localStorage.getItem(pendingKey)) }), { storageKey, pendingKey });
}
async function unchanged(page) { assert.deepEqual(await state(page), { collection: seed, pending }); }
async function hero(page, currency = 'USD') {
  await page.getByRole('heading', { name: /Know what every\s+pull is worth\./ }).waitFor();
  await text(page, 'Keep scanning. Find your next chase.').waitFor();
  await page.getByTestId('pro-card-hero').waitFor();
  const values = currency === 'EUR' ? ['€225.40', '€598.00', '€276.00'] : ['$245.00', '$650.00', '$300.00'];
  for (const [index, position] of ['left', 'center', 'right'].entries()) {
    const card = page.getByTestId(`pro-card-${position}`), price = page.getByTestId(`pro-price-${position}`);
    await card.waitFor(); await price.waitFor();
    assert.ok((await price.textContent()).includes(values[index]), `${position} uses shared ${currency} formatting.`);
    await card.locator('img').first().waitFor();
    await page.waitForFunction(id => { const image = document.querySelector(`[data-testid="${id}"] img`); return image?.complete && image.naturalWidth > 0; }, `pro-card-${position}`);
    const green = await price.evaluate(element => {
      const candidates = [element, ...element.querySelectorAll('*')];
      return candidates.some(candidate => getComputedStyle(candidate).color === 'rgb(120, 255, 154)');
    });
    assert.equal(green, true, `${position} price uses scanner green.`);
  }
  await text(page, `Illustrative values · ${currency}`).waitFor();
  const benefits = page.getByTestId('pro-benefits');
  assert.ok((await benefits.textContent()).includes('Keep scanning, pack after pack.'));
  assert.ok((await benefits.textContent()).includes('Save beyond the 50-card limit.'));
  assert.equal(await text(page, 'Planned for Pro').count(), 0);
  assert.equal(await text(page, 'Purchases are not connected').count(), 0);
}
try {
  await check('three decoded card artworks, scanner-green prices and concise benefits lead the page', async () => {
    const { page } = await fixture(); await go(page); await hero(page); await unchanged(page);
    await page.screenshot({ path: '/tmp/chase-pro-390.png', fullPage: true });
  });
  await check('the page stays usable at 320px and retains an immediately available close control', async () => {
    const { page } = await fixture(320, 640); await go(page); await hero(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No horizontal page overflow.');
    const close = await button(page, 'Close Chase Pro and go to Home').boundingBox();
    assert.ok(close && close.width >= 48 && close.height >= 48 && close.x >= 0 && close.x + close.width <= 321 && close.y < 100);
    await page.screenshot({ path: '/tmp/chase-pro-320-top.png', fullPage: true });
    await button(page, 'Get Chase Pro').scrollIntoViewIfNeeded();
    assert.ok(await button(page, 'Get Chase Pro').isEnabled());
    const visibleClose = await button(page, 'Close Chase Pro and go to Home').boundingBox();
    assert.ok(visibleClose && visibleClose.y >= 0 && visibleClose.y < 100, 'Close remains visible after scrolling.');
    await unchanged(page); await page.screenshot({ path: '/tmp/chase-pro-320.png', fullPage: true });
  });
  await check('illustrative values follow the persisted EUR preference without mutating ownership', async () => {
    const { page } = await fixture(390, 844, 'EUR'); await go(page); await hero(page, 'EUR'); await unchanged(page);
  });
  await check('Get Chase Pro explains unavailable checkout without charging or simulating purchase', async () => {
    const { page } = await fixture(); await go(page); await button(page, 'Get Chase Pro').click();
    const dialog = page.getByRole('dialog', { name: 'Chase Pro', exact: true }); await dialog.waitFor();
    await text(page, 'Subscriptions are currently unavailable. Please try again later. No payment has been taken.').waitFor();
    await unchanged(page); await button(page, 'Got it').click(); await dialog.waitFor({ state: 'hidden' }); await unchanged(page);
  });
  await check('restore, Terms and Privacy reach their honest current destinations', async () => {
    const { page } = await fixture();
    for (const [label, message] of [['Restore purchases', 'Purchase restoration is not connected yet.'], ['Terms', 'Published Terms of Service are not available yet.'], ['Privacy', 'A published Privacy Policy is not available yet.']]) {
      await go(page); await button(page, label).click(); await text(page, message).waitFor(); await unchanged(page);
    }
  });
  await check('Continue with Free returns Home without refilling a spent trial or losing pending scans', async () => {
    const { page } = await fixture(); await go(page); await button(page, 'Continue with Free').click();
    await button(page, 'Scan a Card').waitFor(); await unchanged(page);
  });
  await check('close returns to scanner or Organize while keeping the pending cards intact', async () => {
    for (const destination of ['scanner', 'organize']) {
      const { page } = await fixture(); await go(page, `/paywall?returnTo=${destination}`);
      await button(page, 'Close Chase Pro and return').click();
      await page.waitForURL(url => url.pathname === `/${destination}`); await unchanged(page);
    }
  });
  assert.deepEqual(errors, []); console.log(`Chase Pro passed: ${passed} browser scenarios; no live purchases or accounts.`);
} finally { await Promise.allSettled(contexts.map(context => context.close())); await browser.close(); }
