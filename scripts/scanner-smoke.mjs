import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { installTCGdexFixtures } from './fixtures/tcgdex.mjs';

const url = process.env.CHASE_SMOKE_URL ?? 'http://localhost:8081';
const browser = await chromium.launch({ executablePath: process.env.CHASE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-device-for-media-stream'] });
const errors = [];
let passed = 0;
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' }).filter({ visible: true });
const stored = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key);
const pending = page => stored(page, 'chase.scan-session.v1');
const collection = page => stored(page, 'chase.prototype.v1');
const copies = value => (value?.items ?? []).reduce((sum, row) => sum + row.quantity, 0);
const check = async (name, action) => { await action(); console.log(`PASS ${++passed}: ${name}`); };
async function fixture(plan = 'pro', items = []) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installTCGdexFixtures(context);
  await context.addInitScript(({ plan, items }) => {
    if (!localStorage.getItem('chase.prototype.v1')) localStorage.setItem('chase.prototype.v1', JSON.stringify({ onboardingComplete: true, plan, trial: { successfulRecognitions: 0 }, items }));
  }, { plan, items });
  const page = await context.newPage(); activePage = page; page.setDefaultTimeout(15_000); page.on('pageerror', e => errors.push(e.stack ?? e.message));
  await page.goto(`${url}/scanner`); await button(page, 'Organize (0)').waitFor();
  return { page, context };
}
async function waitCount(page, count) { await button(page, `Organize (${count})`).waitFor(); }
async function present(page, count) { await button(page, 'Present next demo card').click(); await waitCount(page, count); }
let activePage;
try {
  const { page, context } = await fixture(); activePage = page;
  await check('three consecutive cards stay in live scanner and stage once each', async () => {
    await button(page, 'Start demo').click(); await waitCount(page, 3); await button(page, 'Pause demo').click();
    assert.equal(new URL(page.url()).pathname, '/scanner');
    assert.equal((await pending(page)).items.length, 3); assert.equal(copies(await pending(page)), 3);
    assert.deepEqual((await collection(page)).items, []);
    await page.screenshot({ path: '/tmp/chase-continuous-scanner.png' });
  });
  await check('holding the same card does not generate additions; deliberate re-presentation adds a copy', async () => {
    await page.waitForTimeout(2500); assert.equal(copies(await pending(page)), 3);
    await button(page, 'Remove demo card from frame').click(); await page.waitForTimeout(550);
    await button(page, 'Present same demo card again').click(); await waitCount(page, 4);
    const session = await pending(page); assert.equal(session.items.length, 3); assert.equal(session.items.find(row => row.cardId === 'sv6-214').quantity, 2);
  });
  await check('Organize edits quantities and selection without changing Collection', async () => {
    await button(page, 'Organize (4)').click();
    await button(page, 'Increase pending Charizard quantity').click();
    await page.getByText('5 pending cards', { exact: true }).waitFor();
    assert.deepEqual((await collection(page)).items, []);
    await page.getByRole('checkbox', { name: 'Select Umbreon VMAX, Holo', exact: true }).click();
    await button(page, 'Save selected (4)').waitFor();
    await page.screenshot({ path: '/tmp/chase-organize.png' });
  });
  await check('details return to pending session; scanner resumes without re-adding held card', async () => {
    const before = await pending(page);
    await button(page, 'Details for pending Charizard, Holo').click();
    await button(page, 'Return to Organize').waitFor();
    assert.equal(await button(page, /^(Add to collection|Add one copy)$/).count(), 0);
    await button(page, 'Return to Organize').click();
    assert.deepEqual(await pending(page), before);
    await button(page, 'Return to Scanner').first().click(); await waitCount(page, 5);
    await page.waitForTimeout(1800); assert.equal(copies(await pending(page)), 5);
  });
  await check('reload restores pending rows; quantity corrections and removals remain temporary', async () => {
    await page.reload(); await waitCount(page, 5);
    await button(page, 'Organize (5)').click();
    await button(page, 'Remove pending Umbreon VMAX, Holo').click();
    await page.getByText('4 pending cards', { exact: true }).waitFor();
    assert.equal((await pending(page)).items.length, 2);
    assert.deepEqual((await collection(page)).items, []);
  });
  await check('save failure retains cards; retry saves all once and survives reload', async () => {
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === 'chase.prototype.v1') { Storage.prototype.setItem = original; throw new Error('Simulated collection storage failure'); } return original.call(this, key, value); };
    });
    await button(page, 'Save all to Collection').click();
    await page.getByText('4 pending cards', { exact: true }).waitFor();
    assert.deepEqual((await collection(page)).items, []);
    await page.waitForTimeout(300);
    await button(page, 'Save all to Collection').click();
    await page.getByText('4 copies saved to Collection.', { exact: true }).waitFor();
    assert.equal(copies(await collection(page)), 4); assert.equal(copies(await pending(page)), 0);
    await page.reload(); await page.getByText('No pending cards', { exact: true }).waitFor();
    assert.equal(copies(await collection(page)), 4);
    assert.equal(await button(page, 'Save all to Collection').getAttribute('aria-disabled'), 'true');
  });
  await context.close();

  const interrupted = await fixture(); activePage = interrupted.page;
  await check('interrupted pending cleanup cannot replay a confirmed collection save', async () => {
    const page = interrupted.page;
    await present(page, 1); await button(page, 'Organize (1)').click();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === 'chase.scan-session.v1') throw new Error('Simulated pending cleanup failure'); return original.call(this, key, value); };
    });
    await button(page, 'Save all to Collection').click(); await page.getByText('No pending cards', { exact: true }).waitFor();
    assert.equal(copies(await collection(page)), 1);
    assert.equal(copies(await pending(page)), 1, 'Disk still contains acknowledged staging until cleanup can recover.');
    await page.reload(); await page.getByText('No pending cards', { exact: true }).waitFor();
    assert.equal(copies(await collection(page)), 1);
    await button(page, 'Return to Scanner').first().click(); await present(page, 1);
    await button(page, 'Organize (1)').click(); await button(page, 'Save all to Collection').click();
    await page.getByText('1 copy saved to Collection.', { exact: true }).waitFor();
    assert.equal(copies(await collection(page)), 2, 'A new deliberate copy must add only one, excluding the prior receipt.');
  });
  await interrupted.context.close();

  const variants = await fixture(); activePage = variants.page;
  await check('variant changes use the matching quote, merge matching rows and save only selection', async () => {
    const page = variants.page;
    await button(page, 'Start demo').click(); await waitCount(page, 5); await button(page, 'Pause demo').click();
    await button(page, 'Organize (5)').click();
    assert.equal((await pending(page)).items.filter(row => row.name === 'Pikachu').length, 2);
    await button(page, 'Review Pikachu variant').first().click(); await button(page, 'Confirm Reverse holo').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('chase.scan-session.v1')).items.filter(row => row.name === 'Pikachu').length === 1);
    const pikachu = (await pending(page)).items.find(row => row.name === 'Pikachu');
    assert.equal(pikachu.cardId, 'xy12-35-reverse'); assert.equal(pikachu.quantity, 2);
    for (const name of ['Charizard', 'Umbreon VMAX', 'Greninja ex']) await page.getByRole('checkbox', { name: `Select ${name}, Holo`, exact: true }).click();
    await button(page, 'Save selected (2)').click(); await page.getByText('2 copies saved to Collection.', { exact: true }).waitFor();
    assert.deepEqual((await collection(page)).items.map(row => [row.cardId, row.quantity]), [['xy12-35-reverse', 2]]);
    assert.equal(copies(await pending(page)), 3);
  });
  await variants.context.close();

  const free = await fixture('free'); activePage = free.page;
  await check('Free permits one successful recognition; dismissing Pro preserves it', async () => {
    await present(free.page, 1); await button(free.page, 'Explore Chase Pro').waitFor();
    assert.equal((await collection(free.page)).trial.successfulRecognitions, 1);
    await button(free.page, 'Explore Chase Pro').click(); await button(free.page, 'Close Chase Pro and return').click();
    await waitCount(free.page, 1); assert.equal((await pending(free.page)).items.length, 1);
    await free.page.waitForTimeout(2000); assert.equal(copies(await pending(free.page)), 1);
    await free.page.reload(); await waitCount(free.page, 1); await button(free.page, 'Explore Chase Pro').waitFor();
  });
  await check('explicit discard requires confirmation and cannot reset the free trial', async () => {
    await button(free.page, 'Organize (1)').click(); await button(free.page, 'Discard pending session').click();
    await button(free.page, 'Keep session').click(); assert.equal(copies(await pending(free.page)), 1);
    await button(free.page, 'Discard pending session').click(); await button(free.page, 'Discard session').click();
    await free.page.getByText('No pending cards', { exact: true }).waitFor();
    await button(free.page, 'Return to Scanner').first().click(); await button(free.page, 'Explore Chase Pro').waitFor();
    assert.equal((await collection(free.page)).trial.successfulRecognitions, 1);
  });
  await free.context.close();

  const failure = await fixture(); activePage = failure.page;
  await check('failed and ambiguous recognition recover; missing prices never fabricate values', async () => {
    await button(failure.page, 'Demo test controls').click();
    await failure.page.getByRole('switch', { name: 'Development only: simulate failed recognition', exact: true }).click();
    await button(failure.page, 'Present next demo card').click(); await button(failure.page, 'Retry identification').waitFor();
    assert.equal(copies(await pending(failure.page)), 0);
    await failure.page.getByRole('switch', { name: 'Development only: simulate failed recognition', exact: true }).click();
    await failure.page.getByRole('switch', { name: 'Development only: simulate unavailable price', exact: true }).click();
    await failure.page.getByRole('switch', { name: 'Development only: simulate variant review', exact: true }).click();
    await button(failure.page, 'Retry identification').click(); await waitCount(failure.page, 1);
    await button(failure.page, 'Organize (1)').click(); await failure.page.getByText('Price unavailable', { exact: true }).filter({ visible: true }).first().waitFor();
    await button(failure.page, 'Save all to Collection').click(); await failure.page.getByText('Confirm the variant before saving.', { exact: true }).waitFor();
    assert.deepEqual((await collection(failure.page)).items, []);
    await button(failure.page, 'Confirm printing').click();
    await button(failure.page, 'Save all to Collection').click(); await failure.page.getByText('1 copy saved to Collection.', { exact: true }).waitFor();
  });
  await failure.context.close();

  const limited = await fixture('free', [{ cardId: 'xy12-35', quantity: 50, addedAt: '2026-10-01T00:00:00.000Z' }]); activePage = limited.page;
  await check('Free capacity failure retains unsaved scans through paywall and return', async () => {
    await present(limited.page, 1); await button(limited.page, 'Organize (1)').click(); await button(limited.page, 'Save all to Collection').click();
    await limited.page.getByText(/Free collections hold up to 50/).waitFor(); assert.equal(copies(await pending(limited.page)), 1); assert.equal(copies(await collection(limited.page)), 50);
    await button(limited.page, 'Explore Chase Pro').click(); await button(limited.page, 'Close Chase Pro and return').click();
    await button(limited.page, 'Save all to Collection').waitFor(); assert.equal(copies(await pending(limited.page)), 1);
  });
  await limited.context.close();

  const small = await fixture(); activePage = small.page;
  await check('320px scanner and Organize stay usable without horizontal overflow', async () => {
    await small.page.setViewportSize({ width: 320, height: 568 }); await present(small.page, 1);
    for (const view of ['scanner', 'organize']) {
      if (view === 'organize') await button(small.page, 'Organize (1)').click();
      assert.ok(await small.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const action = button(small.page, view === 'scanner' ? 'Organize (1)' : 'Save all to Collection');
      const bounds = await action.boundingBox(); assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 569);
      await small.page.screenshot({ path: `/tmp/chase-${view}-320.png` });
    }
  });
  await small.context.close();
  const camera = await fixture(); activePage = camera.page;
  await check('camera permission denial preserves demo; preview tracks stop under Organize', async () => {
    const page = camera.page;
    await button(page, 'Enable camera preview').click();
    await page.getByText('Camera unavailable. The demo still works.', { exact: true }).waitFor();
    await present(page, 1);
    await camera.context.grantPermissions(['camera'], { origin: url });
    await button(page, 'Enable camera preview').click();
    await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.readyState >= 2));
    await page.evaluate(() => { globalThis.chaseTestVideoTrack = document.querySelector('video').srcObject.getVideoTracks()[0]; });
    await button(page, 'Organize (1)').click();
    await page.waitForFunction(() => globalThis.chaseTestVideoTrack.readyState === 'ended');
    await button(page, 'Return to Scanner').first().click();
    await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.readyState >= 2));
    assert.equal(copies(await pending(page)), 1);
    await button(page, 'Close scanner, keep pending cards').click();
    await page.waitForFunction(() => !document.querySelector('video'));
  });
  await camera.context.close();
  assert.deepEqual(errors, []); console.log(`Scanner workflow passed: ${passed} scenarios, no JavaScript runtime errors.`);
} catch (cause) {
  if (activePage && !activePage.isClosed()) { await activePage.screenshot({ path: '/tmp/chase-scanner-failure.png' }).catch(() => {}); console.error((await activePage.locator('body').innerText()).slice(-2500)); }
  console.error(cause); process.exitCode = 1;
} finally { await browser.close(); }
