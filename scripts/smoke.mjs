import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.CHASE_SMOKE_URL ?? 'http://localhost:8081';
const executablePath = process.env.CHASE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium';
const storageKey = 'chase.prototype.v1';
const cards = {
  'base1-4': { name: 'Charizard', price: 245 },
  'xy12-35': { name: 'Pikachu', price: 1.25 },
  'base1-2': { name: 'Blastoise', price: 88.5 },
  'base1-15': { name: 'Venusaur', price: 69.75 },
  'base2-68': { name: 'Eevee', price: 2.4 },
  'swshp-053': { name: 'Mew', price: 7.65 },
  'xy12-35-reverse': { name: 'Pikachu', price: 4.2 },
};
const initialState = { onboardingComplete: false, plan: 'free', trial: { successfulRecognitions: 0 }, items: [] };
const runtimeErrors = [];
let passed = 0;
let activePage;
let browser;

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const totalCopies = (state) => state.items.reduce((sum, item) => sum + item.quantity, 0);
const visibleText = (page, name) => page.getByText(name, { exact: true }).filter({ visible: true });
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' }).filter({ visible: true });
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(name) }).filter({ visible: true });
const switchControl = (page, name) => page.getByRole('switch', { name, exact: true }).filter({ visible: true });
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function stateOf(page) {
  return page.evaluate((key) => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  }, storageKey);
}

async function waitForState(page, predicate, description) {
  const until = Date.now() + 10_000;
  let last;
  while (Date.now() < until) {
    last = await stateOf(page);
    if (last && predicate(last)) return last;
    await page.waitForTimeout(75);
  }
  assert.fail(`Timed out waiting for ${description}. Last persisted state: ${JSON.stringify(last)}`);
}

async function home(page) {
  await button(page, 'Scan a Card').waitFor();
  await tab(page, 'Home').waitFor();
}

async function scenario(name, action) {
  await action();
  assert.deepEqual(runtimeErrors, [], 'The browser reported a JavaScript runtime error.');
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function watchPage(page) {
  activePage = page;
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(60_000);
  page.on('pageerror', (error) => runtimeErrors.push(error.stack ?? error.message));
}

async function setSwitch(page, name, enabled) {
  const control = switchControl(page, name);
  await control.waitFor();
  const current = await control.isChecked();
  if (current !== enabled) await control.click();
  assert.equal(await control.isChecked(), enabled, `${name} should be ${enabled ? 'enabled' : 'disabled'}`);
}

async function openCard(page, name) {
  await button(page, new RegExp(`^View ${escapeRegex(name)},`)).first().click();
  await button(page, /^(Add to collection|Add one copy)$/).waitFor();
}

async function checkHorizontalLayout(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, `${label} has horizontal page overflow: ${JSON.stringify(dimensions)}`);
  for (const locator of await page.getByRole('button').filter({ visible: true }).all()) {
    const bounds = await locator.boundingBox();
    if (!bounds) continue;
    assert.ok(bounds.width >= 47 && bounds.height >= 47, `${label} has a button smaller than 48px: ${await locator.getAttribute('aria-label') ?? await locator.innerText()}`);
    assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= dimensions.viewport + 1, `${label} has a button outside the screen: ${await locator.getAttribute('aria-label') ?? await locator.innerText()}`);
  }
}

try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watchPage(page);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  await scenario('three introduction screens, skip scan, and paywall close preserve the complimentary scan', async () => {
    await visibleText(page, 'Card prices').waitFor();
    await button(page, 'Continue').click();
    await visibleText(page, 'Scan a card').waitFor();
    await button(page, 'Continue').click();
    await visibleText(page, 'Your collection').waitFor();
    await button(page, 'Get started').click();
    await button(page, 'Try Free Scan').waitFor();
    await button(page, 'Skip for now').click();
    await visibleText(page, 'Purchases are not connected').waitFor();
    await button(page, 'Close Chase Pro and go to Home').click();
    await home(page);
    const state = await waitForState(page, (value) => value.onboardingComplete, 'completed onboarding');
    assert.equal(state.trial.successfulRecognitions, 0);
    assert.deepEqual(state.items, []);
    assert.equal(state.plan, 'free');
    await page.screenshot({ path: '/tmp/chase-home.png' });
  });

  await scenario('onboarding completion survives reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await home(page);
    assert.equal(await visibleText(page, 'Card prices').count(), 0);
    assert.equal((await stateOf(page)).trial.successfulRecognitions, 0);
  });

  await scenario('leaving a pending recognition cancels it without spending the trial', async () => {
    await button(page, 'Scan a Card').click();
    await button(page, 'Use my free sample scan').click();
    await visibleText(page, 'Identifying sample card…').waitFor();
    await page.goBack();
    await home(page);
    await page.waitForTimeout(1_200);
    assert.equal((await stateOf(page)).trial.successfulRecognitions, 0);
    assert.deepEqual((await stateOf(page)).items, []);
  });

  await scenario('failed recognition leaves the free trial available', async () => {
    await button(page, 'Scan a Card').click();
    await setSwitch(page, 'Development only: simulate failed recognition', true);
    await button(page, 'Use my free sample scan').click();
    await visibleText(page, 'No card recognized. Try centering the card in the frame.').waitFor();
    assert.equal((await stateOf(page)).trial.successfulRecognitions, 0);
    assert.deepEqual((await stateOf(page)).items, []);
    await setSwitch(page, 'Development only: simulate failed recognition', false);
  });

  let recognizedCard;
  await scenario('successful recognition spends the trial and requires one explicit save', async () => {
    await button(page, 'Use my free sample scan').click();
    await visibleText(page, 'Demo result').waitFor();
    const beforeSave = await waitForState(page, (value) => value.trial.successfulRecognitions === 1, 'one successful recognition');
    assert.deepEqual(beforeSave.items, [], 'Recognition must not automatically save a card.');
    await button(page, 'Add to Collection').click();
    await visibleText(page, 'One copy saved to your collection.').waitFor();
    const saved = await waitForState(page, (value) => value.items.length === 1, 'confirmed scan save');
    assert.equal(saved.items[0].quantity, 1);
    recognizedCard = saved.items[0].cardId;
    assert.ok(cards[recognizedCard], 'The recognized sample must belong to the catalog.');
    assert.equal(await button(page, 'Add to Collection').count(), 0, 'The save button must disappear after one successful confirmation.');
    await button(page, 'View collection').click();
    await page.getByRole('heading', { name: 'Collection', exact: true }).filter({ visible: true }).waitFor();
    await visibleText(page, money(cards[recognizedCard].price)).first().waitFor();
  });

  await scenario('My Cards search and sorting work, and quantity changes update collection valuation', async () => {
    await button(page, 'My Cards').click();
    const search = page.getByRole('textbox', { name: 'Search your cards by name', exact: true });
    await search.fill('not-a-card');
    await visibleText(page, 'No matching cards').waitFor();
    await button(page, 'Clear search').click();
    await search.fill(cards[recognizedCard].name);
    for (const label of ['Name A–Z', 'Price ↓', 'Recent']) {
      const option = page.getByRole('radio', { name: `Sort by ${label}`, exact: true });
      await option.click();
      assert.equal(await option.isChecked(), true, 'The selected radio option must be exposed to assistive technology.');
    }
    await openCard(page, cards[recognizedCard].name);
    await button(page, `Add one ${cards[recognizedCard].name} copy`).click();
    await waitForState(page, (value) => value.items[0]?.quantity === 2, 'quantity of two');
    await visibleText(page, `Estimated total: ${money(cards[recognizedCard].price * 2)} · demo USD`).waitFor();
    await page.goBack();
    await button(page, 'Browse catalog').waitFor();
    await page.goBack();
    await button(page, 'My Cards').waitFor();
    await visibleText(page, money(cards[recognizedCard].price * 2)).first().waitFor();
    await button(page, 'My Cards').click();
    await openCard(page, cards[recognizedCard].name);
    await button(page, `Remove one ${cards[recognizedCard].name} copy`).click();
    await waitForState(page, (value) => value.items[0]?.quantity === 1, 'quantity of one');
    assert.equal(await button(page, `Remove one ${cards[recognizedCard].name} copy`).getAttribute('aria-disabled'), 'true');
  });

  await scenario('removing a card requires confirmation and cancel keeps the copy', async () => {
    await button(page, 'Remove from collection').click();
    await visibleText(page, 'Remove all 1 copy of this card from your collection?').waitFor();
    await button(page, 'Keep card').click();
    assert.equal(totalCopies(await stateOf(page)), 1);
    await button(page, 'Remove from collection').click();
    await button(page, 'Remove all copies').click();
    await waitForState(page, (value) => value.items.length === 0, 'confirmed removal');
    await button(page, 'Add to collection').waitFor();
    await page.goBack();
    await visibleText(page, 'No cards yet').waitFor();
    await page.goBack();
    await visibleText(page, 'Your collection starts here').waitFor();
  });

  await scenario('manual catalog search remains free after the complimentary scan is used', async () => {
    await button(page, 'Browse cards').click();
    const search = page.getByRole('textbox', { name: 'Search sample catalog by name, set, or card number', exact: true });
    await search.fill('Charizard');
    await visibleText(page, '1 result').waitFor();
    await openCard(page, 'Charizard');
    await button(page, 'Add to collection').click();
    await waitForState(page, (value) => value.items.some((item) => item.cardId === 'base1-4' && item.quantity === 1), 'manually added Charizard');
    await page.goBack();
    await search.fill('35/108');
    await visibleText(page, '2 results').waitFor();
    await button(page, 'Show list').click();
    await button(page, 'Show grid').click();
    await button(page, 'View Pikachu, Evolutions, Normal').click();
    await button(page, 'Add to collection').click();
    const saved = await waitForState(page, (value) => totalCopies(value) === 2, 'two manually saved cards');
    assert.equal(saved.trial.successfulRecognitions, 1);
    await page.goBack();
    await page.goBack();
    await visibleText(page, '$246.25').first().waitFor();
    await button(page, 'My Cards').click();
    for (const [sort, firstName] of [['Name A–Z', 'Charizard'], ['Price ↓', 'Charizard'], ['Recent', 'Pikachu']]) {
      await page.getByRole('radio', { name: `Sort by ${sort}`, exact: true }).click();
      const firstCard = button(page, /^View (Charizard|Pikachu),/).first();
      assert.ok((await firstCard.getAttribute('aria-label')).startsWith(`View ${firstName},`), `${sort} should place ${firstName} first.`);
    }
    await page.goBack();
    await page.screenshot({ path: '/tmp/chase-collection.png' });
    await tab(page, 'Home').click();
    await button(page, 'Scan a Card').click();
    await visibleText(page, 'Purchases are not connected').waitFor();
    await button(page, 'Close Chase Pro and go to Home').click();
    await home(page);
    assert.equal((await stateOf(page)).trial.successfulRecognitions, 1);
  });

  await scenario('Free collections reject a 51st copy with upgrade feedback and preserve saved cards', async () => {
    const fixture = { ...initialState, onboardingComplete: true, trial: { successfulRecognitions: 1 }, items: [{ cardId: 'base1-4', quantity: 50, addedAt: '2026-10-01T00:00:00.000Z' }] };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: fixture });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await home(page);
    assert.deepEqual(await stateOf(page), fixture);
    await button(page, 'Search Cards').click();
    await page.getByRole('textbox', { name: 'Search sample catalog by name, set, or card number', exact: true }).fill('Pikachu');
    await button(page, 'View Pikachu, Evolutions, Normal').click();
    await button(page, 'Add to collection').click();
    await visibleText(page, 'Free collections hold up to 50 cards. Upgrade to Pro to add more.').waitFor();
    await button(page, 'Upgrade to Chase Pro').waitFor();
    assert.deepEqual(await stateOf(page), fixture, 'A rejected addition must not mutate the collection.');
    await button(page, 'Upgrade to Chase Pro').click();
    await button(page, 'Close Chase Pro and go to Home').click();
    await home(page);
  });

  let proCard;
  await scenario('simulated Pro permits repeated scans and more than 50 saved copies', async () => {
    await tab(page, 'Profile').click();
    await setSwitch(page, 'Development only · simulate Pro', true);
    await waitForState(page, (value) => value.plan === 'pro', 'simulated Pro access');
    await tab(page, 'Home').click();
    await button(page, 'Scan a Card').click();
    await button(page, 'Run sample scan').click();
    await button(page, 'Add to Collection').waitFor();
    assert.equal(totalCopies(await stateOf(page)), 50, 'Pro recognition must still require confirmation.');
    const before = await stateOf(page);
    await button(page, 'Add to Collection').click();
    const firstSave = await waitForState(page, (value) => totalCopies(value) === 51, '51 saved Pro copies');
    proCard = firstSave.items.find((item) => item.quantity !== (before.items.find((previous) => previous.cardId === item.cardId)?.quantity ?? 0)).cardId;
    await button(page, 'Scan another card').click();
    await button(page, 'Run sample scan').click();
    await button(page, 'Add to Collection').waitFor();
    assert.equal(totalCopies(await stateOf(page)), 51);
    await button(page, 'Add to Collection').click();
    const secondSave = await waitForState(page, (value) => totalCopies(value) === 52, '52 saved Pro copies');
    assert.equal(secondSave.plan, 'pro');
    assert.equal(secondSave.trial.successfulRecognitions, 1);
    await button(page, 'View collection').click();
    await visibleText(page, 'Unlimited collection · Pro').waitFor();
  });

  await scenario('downgrading and reloading preserve owned copies and allow reducing an over-limit quantity', async () => {
    await tab(page, 'Profile').click();
    await setSwitch(page, 'Development only · simulate Pro', false);
    const downgraded = await waitForState(page, (value) => value.plan === 'free', 'simulated downgrade');
    assert.equal(totalCopies(downgraded), 52);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await visibleText(page, '52 / 50 copies').waitFor();
    assert.equal(totalCopies(await stateOf(page)), 52, 'Reload must never discard owned cards after a downgrade.');
    await tab(page, 'Collection').click();
    await button(page, 'My Cards').click();
    await openCard(page, cards[proCard].name);
    await button(page, `Remove one ${cards[proCard].name} copy`).click();
    await waitForState(page, (value) => totalCopies(value) === 51, 'reduced over-limit quantity');
    const reduced = await stateOf(page);
    await button(page, `Add one ${cards[proCard].name} copy`).click();
    await visibleText(page, 'Free collections hold up to 50 cards. Upgrade to Pro to add more.').waitFor();
    assert.deepEqual(await stateOf(page), reduced);
    await page.goBack();
    await page.goBack();
    await tab(page, 'Profile').click();
  });

  await scenario('account, restoration, legal, currency, and support routes describe their actual prototype state', async () => {
    const before = await stateOf(page);
    const destinations = [
      ['Create Account', 'Account creation is not connected yet.'],
      ['Sign In', 'Sign in is not connected yet.'],
      [/Restore Purchases/, 'Purchase restoration is not connected yet.'],
      [/Privacy Policy/, 'A published Privacy Policy is not available yet.'],
      [/Terms of Service/, 'Published Terms of Service are not available yet.'],
      [/Contact Support/, 'A support destination is not configured yet.'],
      [/Currency/, 'US Dollar (USD)'],
      [/About Chase/, 'Chase · v0.1 frontend prototype'],
    ];
    for (const [destination, message] of destinations) {
      await button(page, destination).click();
      await visibleText(page, message).waitFor();
      assert.equal(await page.getByRole('textbox').filter({ visible: true }).count(), 0, 'Prototype account screens must not collect credentials.');
      if (/Policy|Terms|Support/.test(String(destination))) assert.equal(await button(page, 'Open website').count(), 0, 'Unconfigured destinations must not expose fabricated links.');
      await page.goBack();
      await button(page, 'Create Account').waitFor();
    }
    assert.deepEqual(await stateOf(page), before, 'Informational account flows must not grant Pro or alter collection data.');
    await page.screenshot({ path: '/tmp/chase-profile.png' });
  });

  await scenario('development onboarding preview preserves the saved collection and scanner allowance', async () => {
    const before = await stateOf(page);
    await button(page, 'Preview onboarding').click();
    await visibleText(page, 'Card prices').waitFor();
    await page.getByRole('img', { name: /Charizard, Base Set/ }).waitFor();
    assert.deepEqual(await stateOf(page), before);
    await button(page, 'Skip').click();
    await button(page, 'Skip for now').click();
    await button(page, 'Close Chase Pro and go to Home').click();
    await home(page);
    assert.deepEqual(await stateOf(page), before, 'Previewing onboarding must not reset owned cards or grant another free scan.');
  });

  await scenario('unknown card routes offer a recoverable empty state', async () => {
    await page.goto(new URL('/card/not-in-catalog', baseUrl).href, { waitUntil: 'domcontentloaded' });
    await visibleText(page, 'Card not found').waitFor();
    await button(page, 'Browse cards').click();
    await visibleText(page, 'Card catalog').waitFor();
  });

  await scenario('320px screens keep Home, Collection, My Cards, detail, and Profile controls usable', async () => {
    const small = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1 });
    const fixture = { ...initialState, onboardingComplete: true, items: [
      { cardId: 'base1-4', quantity: 1, addedAt: '2026-10-01T00:00:00.000Z' },
      { cardId: 'xy12-35', quantity: 1, addedAt: '2026-10-02T00:00:00.000Z' },
    ] };
    await small.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: storageKey, value: fixture });
    const mobile = await small.newPage();
    watchPage(mobile);
    await mobile.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await home(mobile);
    await checkHorizontalLayout(mobile, '320px Home');
    await tab(mobile, 'Collection').click();
    await button(mobile, 'My Cards').waitFor();
    await checkHorizontalLayout(mobile, '320px Collection');
    await button(mobile, 'My Cards').click();
    await button(mobile, 'Browse catalog').waitFor();
    await checkHorizontalLayout(mobile, '320px My Cards');
    await mobile.screenshot({ path: '/tmp/chase-small-my-cards.png' });
    await openCard(mobile, 'Charizard');
    await checkHorizontalLayout(mobile, '320px card detail');
    await mobile.goBack();
    await mobile.goBack();
    await tab(mobile, 'Profile').click();
    await switchControl(mobile, 'Development only · simulate Pro').waitFor();
    await checkHorizontalLayout(mobile, '320px Profile');
    await mobile.screenshot({ path: '/tmp/chase-small-profile.png' });
    await small.close();
    activePage = page;
  });

  await scenario('new chase printings show real images and survive saving and reloading', async () => {
    const chaseContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await chaseContext.addInitScript(({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    }, { key: storageKey, value: { ...initialState, onboardingComplete: true } });
    const chasePage = await chaseContext.newPage();
    watchPage(chasePage);
    await chasePage.goto(new URL('/search', baseUrl).href, { waitUntil: 'domcontentloaded' });
    const chases = [
      ['swsh7-215', 'Umbreon VMAX', 'Evolving Skies', '215/203'],
      ['swsh7-218', 'Rayquaza VMAX', 'Evolving Skies', '218/203'],
      ['swsh7-192', 'Dragonite V', 'Evolving Skies', '192/203'],
      ['swsh8-271', 'Gengar VMAX', 'Fusion Strike', '271/264'],
      ['swsh11-186', 'Giratina V', 'Lost Origin', '186/196'],
      ['swsh12-186', 'Lugia V', 'Silver Tempest', '186/195'],
      ['sv2-203', 'Magikarp', 'Paldea Evolved', '203/193'],
      ['xyp-XY133', 'Ash-Greninja EX', 'XY Black Star Promos', 'XY133'],
    ];
    for (const [id, name, set, number] of chases) {
      await chasePage.getByRole('textbox', { name: 'Search sample catalog by name, set, or card number' }).fill(name);
      await visibleText(chasePage, '1 result').waitFor();
      await openCard(chasePage, name);
      await visibleText(chasePage, `${set} · ${number}`).waitFor();
      const image = chasePage.getByRole('img', { name: `${name}, ${set}, ${number}, Pokémon TCG card`, exact: true });
      await image.waitFor();
      await image.evaluate(async element => {
        const img = element instanceof HTMLImageElement ? element : element.querySelector('img');
        if (!img) throw new Error('Card print does not contain an image');
        await img.decode();
        if (img.naturalWidth !== 600 || img.naturalHeight !== 825) throw new Error('Incorrect card image dimensions');
      });
      await button(chasePage, 'Add to collection').click();
      await waitForState(chasePage, value => value.items.some(item => item.cardId === id && item.quantity === 1), `saved ${name}`);
      await chasePage.goBack();
    }
    await chasePage.reload({ waitUntil: 'domcontentloaded' });
    const saved = await waitForState(chasePage, value => value.items.length === chases.length, 'all new chase printings after reload');
    assert.deepEqual(saved.items.map(item => item.cardId).sort(), chases.map(([id]) => id).sort());
    assert.equal(saved.trial.successfulRecognitions, 0, 'Manual additions must not consume the scan trial.');
    await checkHorizontalLayout(chasePage, 'expanded chase catalog');
    await chaseContext.close();
    activePage = page;
  });

  await scenario('wallet ranges, top-card showcase, full inventory and quantity revaluation stay consistent', async () => {
    const walletContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const fixture = { ...initialState, onboardingComplete: true, items: [
      { cardId: 'base1-4', quantity: 2, addedAt: '2026-10-17T00:00:00.000Z' },
      { cardId: 'swsh7-215', quantity: 1, addedAt: '2026-10-17T01:00:00.000Z' },
      { cardId: 'xy12-35-reverse', quantity: 3, addedAt: '2026-10-17T02:00:00.000Z' },
      { cardId: 'base2-68', quantity: 10, addedAt: '2026-10-17T03:00:00.000Z' },
    ] };
    await walletContext.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: storageKey, value: fixture });
    const wallet = await walletContext.newPage(); watchPage(wallet);
    await wallet.goto(new URL('/collection', baseUrl).href, { waitUntil: 'domcontentloaded' });
    await visibleText(wallet, '$1,176.60').waitFor();
    await wallet.getByRole('radio', { name: '7D history', exact: true }).click();
    assert.equal(await wallet.getByRole('radio', { name: '7D history', exact: true }).getAttribute('aria-checked'), 'true');
    const chart = wallet.getByRole('slider', { name: 'Collection value history', exact: true });
    await chart.click({ position: { x: 16, y: 60 } });
    assert.match(await chart.getAttribute('aria-valuetext'), /Sep 24, 2026/);
    await chart.focus(); await wallet.keyboard.press('ArrowRight');
    assert.match(await chart.getAttribute('aria-valuetext'), /Sep 25, 2026/);
    await chart.focus(); await wallet.keyboard.press('ArrowRight');
    assert.match(await chart.getAttribute('aria-valuetext'), /Sep 26, 2026/);
    await wallet.keyboard.press('Home');
    assert.match(await chart.getAttribute('aria-valuetext'), /Sep 24, 2026/);
    assert.equal(await chart.getAttribute('aria-valuenow'), '0');
    await wallet.keyboard.press('End');
    assert.match(await chart.getAttribute('aria-valuetext'), /Oct 1, 2026/);
    assert.equal(await chart.getAttribute('aria-valuenow'), '7');
    await wallet.getByRole('radio', { name: '1Y history', exact: true }).click();
    await visibleText(wallet, 'Oct 1, 2025').waitFor();
    assert.match(await chart.getAttribute('aria-valuetext'), /Oct 1, 2026.*1,176.60/);
    await visibleText(wallet, 'Top cards').waitFor();
    const topRows = button(wallet, /^View .*, [0-9]+ copies$/);
    assert.deepEqual(await topRows.evaluateAll(rows => rows.map(row => row.getAttribute('aria-label'))), [
      'View Umbreon VMAX, Holo, 1 copies', 'View Charizard, Holo, 2 copies', 'View Pikachu, Reverse holo, 3 copies',
    ], 'Show only the three highest-priced printings, independent of owned quantity.');
    assert.match(await button(wallet, 'View Charizard, Holo, 2 copies').innerText(), /\$245\.00/);
    assert.equal(await wallet.getByRole('tab', { name: 'Allocation', exact: true }).count(), 0);
    await button(wallet, 'See all').click();
    await wallet.getByRole('textbox', { name: 'Search your cards by name', exact: true }).waitFor();
    await visibleText(wallet, '4 unique cards · 16 copies').waitFor();
    await wallet.getByRole('textbox', { name: 'Search your cards by name', exact: true }).fill('Eevee');
    await visibleText(wallet, 'Eevee').waitFor();
    assert.deepEqual(await stateOf(wallet), fixture, 'Opening and searching the full inventory must preserve owned cards.');
    await wallet.goBack();
    await button(wallet, 'View Charizard, Holo, 2 copies').click();
    await button(wallet, 'Add one Charizard copy').click();
    await waitForState(wallet, value => value.items.find(item => item.cardId === 'base1-4')?.quantity === 3, 'revalued Charizard position');
    await wallet.goBack();
    await visibleText(wallet, '$1,421.60').waitFor();
    assert.match(await chart.getAttribute('aria-valuetext'), /1,421.60/);
    assert.equal((await stateOf(wallet)).trial.successfulRecognitions, 0);
    await wallet.reload({ waitUntil: 'domcontentloaded' });
    await visibleText(wallet, '$1,421.60').waitFor();
    await checkHorizontalLayout(wallet, 'wallet tracking');
    await walletContext.close(); activePage = page;
  });

  await scenario('empty-wallet preview and Home set shortcuts do not mutate owned cards or scan allowance', async () => {
    const previewContext = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1 });
    await previewContext.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: storageKey, value: { ...initialState, onboardingComplete: true } });
    const previewPage = await previewContext.newPage(); watchPage(previewPage);
    await previewPage.goto(new URL('/collection', baseUrl).href, { waitUntil: 'domcontentloaded' });
    await button(previewPage, 'Preview sample wallet').waitFor(); assert.equal(await previewPage.getByRole('slider').count(), 0, 'An empty wallet should prioritize adding cards rather than an empty curve.'); const before = await stateOf(previewPage);
    await button(previewPage, 'Preview sample wallet').click();
    await visibleText(previewPage, 'Sample collection · preview only').waitFor();
    await visibleText(previewPage, '$1,270.00').waitFor();
    assert.deepEqual(await stateOf(previewPage), before);
    await previewPage.getByRole('radio', { name: '3M history', exact: true }).click();
    assert.equal(await button(previewPage, /^View .*, [0-9]+ copies$/).count(), 3);
    await button(previewPage, 'See all').waitFor();
    await checkHorizontalLayout(previewPage, '320px sample wallet');
    await button(previewPage, 'Return to my collection').click();
    await visibleText(previewPage, '$0.00').first().waitFor();
    assert.deepEqual(await stateOf(previewPage), before);
    await tab(previewPage, 'Home').click();
    await button(previewPage, 'Browse Evolving Skies, 3 printings').click();
    await visibleText(previewPage, '3 results').waitFor();
    assert.equal(await previewPage.getByRole('textbox', { name: 'Search sample catalog by name, set, or card number' }).inputValue(), 'Evolving Skies');
    assert.deepEqual(await stateOf(previewPage), before);
    await previewContext.close(); activePage = page;
  });

  console.log(`Chase browser smoke passed: ${passed} scenarios; no JavaScript runtime errors.`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: '/tmp/chase-smoke-failure.png' }).catch(() => {});
    console.error(`Active URL: ${activePage.url()}`);
  }
  if (runtimeErrors.length) console.error('Browser runtime errors:', runtimeErrors);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
