import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const url = process.env.CHASE_SMOKE_URL ?? 'http://localhost:8088';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const browser = await chromium.launch({ executablePath: process.env.CHASE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const seed = { onboardingComplete: true, plan: 'free', trial: { successfulRecognitions: 0 }, items: [{ cardId: 'base1-4', quantity: 2, addedAt: '2026-10-25T00:00:00Z' }] };
const errors = [];
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion });
    await context.route('https://**/*', route => route.abort());
    await context.addInitScript(seed => { if (!localStorage.getItem('chase.prototype.v1')) localStorage.setItem('chase.prototype.v1', JSON.stringify(seed)); }, seed);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    const splash = page.getByTestId('startup-splash');
    if (reducedMotion === 'no-preference') {
      await splash.waitFor();
      await page.waitForFunction(() => {
        const word = document.querySelector('[data-testid="splash-wordmark"]');
        return word && Number(getComputedStyle(word).opacity) > 0.98;
      });
      await page.screenshot({ path: '/tmp/chase-startup-splash.png' });
    }
    await splash.waitFor({ state: 'detached', timeout: 6000 });
    await page.getByRole('button', { name: 'Scan a Card', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('chase.prototype.v1'))), seed);
    await page.getByRole('tab', { name: /Collection/ }).click();
    await page.getByRole('button', { name: 'My Cards', exact: true }).waitFor();
    assert.equal(await splash.count(), 0, 'Navigation must not replay the launch animation.');
    await page.reload(); await splash.waitFor({ state: 'detached', timeout: 6000 });
    await page.getByRole('button', { name: 'My Cards', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('chase.prototype.v1'))), seed);
    console.log(`PASS: ${reducedMotion} startup, navigation, reload and saved cards`);
    await context.close();
  }
  const context = await browser.newContext();
  await context.route('https://**/*', route => route.abort());
  await context.addInitScript(() => localStorage.setItem('chase.prototype.v1', '{invalid'));
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.getByTestId('startup-splash').waitFor({ state: 'detached', timeout: 6000 });
  await page.getByRole('button', { name: 'Retry loading', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('chase.prototype.v1')), '{invalid');
  console.log('PASS: failed storage remains recoverable after splash without overwriting data');
  await context.close();
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
