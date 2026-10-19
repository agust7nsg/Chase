import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { catalogKey, catalogSearchLabel, installTCGdexFixtures, quoteUpdatedAt, fixtureSets } from './fixtures/tcgdex.mjs';

const baseUrl = process.env.CHASE_SMOKE_URL ?? 'http://localhost:8081';
const storageKey = 'chase.prototype.v1';
const sessionKey = 'chase.scan-session.v1';
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' }).filter({ visible: true });
const text = (page, name) => page.getByText(name, { exact: true }).filter({ visible: true });
const search = page => page.getByRole('textbox', { name: catalogSearchLabel, exact: true });
const stored = (page, key = storageKey) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key);
const tiles = page => button(page, /^View .*,/);
const errors = [];
const fixtureControls = [];
let passed = 0;
let activePage;
let browser;

const legacyItems = [
  { cardId: 'base2-68', quantity: 2, addedAt: '2026-09-10T00:00:00.000Z' },
  { cardId: 'swshp-053', quantity: 1, addedAt: '2026-09-11T00:00:00.000Z' },
];
const pendingFixture = {
  version: 1, id: 'before-real-catalog', freeRecognitionUsed: false,
  items: [{ id: 'legacy-pending', operationId: 'legacy-pending-operation', cardId: 'xy12-35-reverse',
    name: 'Pikachu', imageKey: 'pikachu', setName: 'Evolutions', collectorNumber: '35/108', variant: 'Reverse holo',
    quantity: 2, identifiedAt: '2026-09-12T00:00:00.000Z', ambiguity: 'confirmed', priceState: 'available',
    price: { amount: 4.2, currency: 'USD', source: 'mock', updatedAt: quoteUpdatedAt } }],
};
const initialState = items => ({ onboardingComplete: true, plan: 'free', trial: { successfulRecognitions: 0 }, items });

async function fixture({ items = [], pending = null, offline = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const network = await installTCGdexFixtures(context);
  fixtureControls.push(network); network.offline = offline;
  await context.addInitScript(({ state, pending, storageKey, sessionKey }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(state));
    if (pending && !localStorage.getItem(sessionKey)) localStorage.setItem(sessionKey, JSON.stringify(pending));
  }, { state: initialState(items), pending, storageKey, sessionKey });
  const page = await context.newPage(); activePage = page;
  page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(60_000);
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  return { context, page, network };
}
async function go(page, path) { await page.goto(new URL(path, baseUrl).href, { waitUntil: 'domcontentloaded' }); }
async function waitState(page, predicate, description) {
  const until = Date.now() + 10_000;
  let last;
  while (Date.now() < until) {
    last = await stored(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(75);
  }
  assert.fail(`Timed out waiting for ${description}: ${JSON.stringify(last)}`);
}
async function check(name, action) {
  await action(); assert.deepEqual(errors, [], 'Browser JavaScript errors');
  assert.ok(fixtureControls.every(fixture => fixture.failures.length === 0), 'Every catalog API request must have a deliberate fixture.');
  console.log(`PASS ${++passed}: ${name}`);
}
async function query(page, value, count) {
  await search(page).fill(value);
  await text(page, `${count} ${count === 1 ? 'result' : 'results'}`).waitFor();
}
async function openCard(page, name) {
  await button(page, new RegExp(`^View ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},`)).first().click();
  await button(page, /^(Add to collection|Add one copy)$/).waitFor();
  await text(page, 'Loading printing details…').waitFor({ state: 'hidden' });
}
async function assertQuote(page, amount, variant) {
  await text(page, amount).first().waitFor();
  await text(page, 'TCGplayer · updated Oct 1, 2026 · USD').waitFor();
  await text(page, 'Estimate for this variant. Price history is unavailable.').waitFor();
  assert.equal(await page.getByRole('slider').count(), 0, 'Provider quotes must not acquire fabricated history.');
  assert.equal(await text(page, 'Sample history · USD').count(), 0);
  if (variant) assert.equal(await button(page, `View ${variant} variant`).getAttribute('aria-pressed'), 'true');
}

try {
  browser = await chromium.launch({ executablePath: process.env.CHASE_BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const main = await fixture({ items: legacyItems, pending: pendingFixture });
  const { page, network, context } = main;
  await go(page, '/search');

  await check('all expansions open newest first with logos and no random card feed', async () => {
    await page.getByRole('tab', { name: 'Browse sets', exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Browse sets', exact: true }).getAttribute('aria-selected'), 'true');
    await text(page, `${fixtureSets.length} sets`).waitFor();
    await text(page, 'Newest first').waitFor();
    const setButtons = button(page, /^Browse /);
    assert.deepEqual((await setButtons.evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')))).slice(0, 2), ['Browse 30th Celebration', 'Browse 30th Classic Collection']);
    const anniversary = page.getByRole('img', { name: '30th Celebration set logo', exact: true });
    await anniversary.waitFor();
    await page.waitForFunction(() => [...document.images].some(image => image.src.endsWith('/me/30th/logo.png') && image.complete && image.naturalWidth > 0));
    await page.getByRole('img', { name: '30th Classic Collection anniversary logo', exact: true }).waitFor();
    assert.equal(await tiles(page).count(), 0);
    assert.equal(await text(page, '24 results').count(), 0);
    const field = page.getByRole('textbox', { name: 'Search Pokémon card sets', exact: true });
    await field.fill('Fusion');
    const logo = page.getByRole('img', { name: 'Fusion Strike set logo', exact: true });
    await logo.waitFor();
    const source = await logo.evaluate(element => (element instanceof HTMLImageElement ? element : element.querySelector('img'))?.src);
    assert.equal(source, 'https://assets.tcgdex.net/en/swsh/swsh8/logo.webp');
    await button(page, 'Browse Fusion Strike').click();
    await text(page, '2 cards').waitFor();
    await page.getByRole('heading', { name: 'Fusion Strike', exact: true }).waitFor();
    const rows = await tiles(page).allTextContents();
    assert.ok(rows[0].includes('Gengar VMAX')); assert.ok(rows[1].includes('Mew VMAX'));
    await page.goBack();
    await field.waitFor(); assert.equal(await field.inputValue(), 'Fusion');
    await field.fill("McDonald's");
    await button(page, "Browse McDonald's Collection 2011").click();
    await text(page, '1 card').waitFor();
    await button(page, /^View Bulbasaur,/).waitFor();
    await page.getByRole('img', { name: 'Bulbasaur: artwork unavailable', exact: true }).waitFor();
    assert.deepEqual((await stored(page)).items, legacyItems);
    await page.screenshot({ path: '/tmp/chase-set-cards-missing-art.png' });
    await go(page, '/search?query=Base');
  });

  await check('catalog browsing requests provider pages and Load more appends unique printings', async () => {
    await button(page, 'Load more cards').waitFor();
    const before = await tiles(page).count();
    await text(page, '24 of 26 results').waitFor();
    assert.equal(await text(page, '24 results').count(), 0);
    assert.ok(before > 0 && before <= 24);
    await button(page, 'Load more cards').click();
    await page.waitForFunction(before => [...document.querySelectorAll('[role="button"][aria-label^="View "]')].filter(row => row.getAttribute('aria-label').includes(',')).length > before, before);
    const labels = await tiles(page).evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')));
    assert.equal(new Set(labels).size, labels.length, 'More pages must not duplicate cards.');
    assert.ok(network.requests.some(value => new URL(value).searchParams.get('pagination:page') === '2'));
    assert.deepEqual((await stored(page)).items, legacyItems);
  });

  await check('set pages show exact loaded totals and paginate the entire set by descending price', async () => {
    await go(page, '/search?setId=base1&setName=Base%20Set');
    await text(page, '24 of 26 cards').waitFor();
    const labels = await tiles(page).evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')));
    assert.match(labels[0], /^View Charizard,/); assert.match(labels[1], /^View Dewgong,/);
    assert.match(labels[2], /^View Charmeleon,/); assert.match(labels[3], /^View Arcanine,/);
    await text(page, 'Price: high to low · USD / copy').waitFor();
    const requestsBeforeMore = network.requests.length;
    await button(page, 'Load more cards').click(); await text(page, '26 cards').waitFor();
    assert.equal(network.requests.length, requestsBeforeMore, 'The cached full-set ranking must paginate without another price crawl.');
    assert.match((await tiles(page).last().getAttribute('aria-label')), /^View Squirtle,/);
    assert.equal(await tiles(page).count(), 26);
    assert.equal(await button(page, 'Load more cards').count(), 0);
    await go(page, '/search?view=cards');
    await text(page, 'Search across all sets').waitFor();
    assert.equal(await tiles(page).count(), 0);
  });

  await check('anniversary RGB Mew printings precede commons, and Home shares newest-first expansion order', async () => {
    await go(page, '/search?setId=30th&setName=30th%20Celebration');
    await text(page, '5 cards').waitFor();
    const labels = await tiles(page).evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')));
    assert.ok(labels.slice(0, 3).every(label => label.startsWith('View Mew,')));
    const contents = await tiles(page).allTextContents();
    assert.match(contents[0], /Holo · R/); assert.match(contents[1], /Holo · B/); assert.match(contents[2], /Holo · G/);
    await go(page, '/');
    const shelf = page.getByLabel('Pokémon TCG expansions', { exact: true });
    await shelf.waitFor();
    const names = await shelf.getByRole('button').evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')));
    assert.deepEqual(names.slice(0, 2), ['Browse 30th Celebration', 'Browse 30th Classic Collection']);
    assert.ok(network.requests.some(value => { const url = new URL(value); return url.pathname.endsWith('/sets') && url.searchParams.get('sort:field') === 'releaseDate' && url.searchParams.get('sort:order') === 'DESC'; }));
    assert.deepEqual((await stored(page)).items, legacyItems);
    await go(page, '/search?view=cards');
  });

  await check('remote name, set-name, collector-number and explicit set filters resolve matching printings', async () => {
    await query(page, 'Charizard', 1); await button(page, /^View Charizard,/).waitFor();
    await query(page, 'Evolving Skies', 3);
    assert.equal(await button(page, /^View (Umbreon VMAX|Rayquaza VMAX|Dragonite V),/).count(), 3);
    await query(page, '214/167', 1); await button(page, /^View Greninja ex,/).waitFor();
    await search(page).fill(''); await button(page, 'Filter by set, all sets').click();
    await page.getByRole('textbox', { name: 'Search Pokémon card sets', exact: true }).fill('Evolutions');
    await button(page, 'Filter by Evolutions').click();
    await query(page, '35/108', 1); await button(page, /^View Pikachu,/).waitFor();
    await button(page, 'Clear set filter').click();
    await query(page, 'Pikachu', 1);
    assert.ok(network.requests.some(value => new URL(value).pathname.endsWith('/sets')));
  });

  await check('full details use exact variant quotes and save normal and reverse as independent identities', async () => {
    await openCard(page, 'Pikachu');
    await assertQuote(page, '$1.25', 'Normal');
    await button(page, 'Add to collection').click();
    await waitState(page, state => state.items.some(row => row.cardId === catalogKey('xy12-35', 'normal')), 'normal Pikachu snapshot');
    await button(page, 'View Reverse holo variant').click();
    await assertQuote(page, '$4.20', 'Reverse holo');
    await button(page, 'Add to collection').click();
    const saved = await waitState(page, state => state.items.some(row => row.cardId === catalogKey('xy12-35', 'reverse')), 'reverse Pikachu snapshot');
    const normal = saved.items.find(row => row.cardId === catalogKey('xy12-35', 'normal'));
    const reverse = saved.items.find(row => row.cardId === catalogKey('xy12-35', 'reverse'));
    assert.equal(normal.card.marketPrice.amount, 1.25); assert.equal(reverse.card.marketPrice.amount, 4.2);
    assert.equal(normal.card.catalogIdentity.variant, 'normal'); assert.equal(reverse.card.catalogIdentity.variant, 'reverse');
    assert.equal(reverse.card.marketPrice.source, 'tcgplayer'); assert.equal(reverse.card.marketPrice.currency, 'USD');
    assert.match(reverse.card.imageUrl, /^https:\/\/assets\.tcgdex\.net\/en\/xy\/xy12\/35\//);
    assert.deepEqual(saved.items.filter(row => !row.cardId.startsWith('tcgdex:')), legacyItems);
    assert.equal(saved.trial.successfulRecognitions, 0);
    await page.screenshot({ path: '/tmp/chase-catalog-variant.png' });
  });

  await check('missing provider pricing stays unavailable while saving a durable unpriced copy', async () => {
    await go(page, '/search?view=cards'); await query(page, 'Squirtle', 1); await openCard(page, 'Squirtle');
    await text(page, 'Price unavailable').waitFor();
    await text(page, 'No ungraded quote is available for this variant.').waitFor();
    assert.equal(await text(page, '$0.00').count(), 0);
    assert.equal(await page.getByRole('slider').count(), 0);
    await button(page, 'Add to collection').click();
    const saved = await waitState(page, state => state.items.some(row => row.cardId === catalogKey('base1-63', 'normal')), 'unpriced Squirtle copy');
    assert.equal(saved.items.find(row => row.cardId === catalogKey('base1-63', 'normal')).card.marketPrice, null);
    await text(page, 'Estimated total unavailable · price missing').waitFor();
  });

  await check('cold offline collection restores provider snapshots and unchanged legacy metadata and quantity controls', async () => {
    network.offline = true;
    await go(page, '/my-cards');
    await page.getByRole('textbox', { name: 'Search your cards by name', exact: true }).waitFor();
    await button(page, 'View Eevee, Base Set 2, Normal, 2 copies').waitFor();
    await openCard(page, 'Eevee'); await text(page, 'Base Set 2 · 51/130').first().waitFor();
    await go(page, '/my-cards');
    await button(page, 'View Pikachu, Evolutions, Reverse holo, 1 copies').click();
    await assertQuote(page, '$4.20', 'Reverse holo');
    await button(page, 'Add one Pikachu copy').click();
    await waitState(page, state => state.items.find(row => row.cardId === catalogKey('xy12-35', 'reverse'))?.quantity === 2, 'two offline reverse copies');
    await button(page, 'Remove one Pikachu copy').click();
    await waitState(page, state => state.items.find(row => row.cardId === catalogKey('xy12-35', 'reverse'))?.quantity === 1, 'one offline reverse copy');
    await button(page, 'Remove from collection').click(); await button(page, 'Keep card').click();
    await page.reload({ waitUntil: 'domcontentloaded' }); await assertQuote(page, '$4.20', 'Reverse holo');
    const saved = await stored(page);
    assert.deepEqual(saved.items.filter(row => !row.cardId.startsWith('tcgdex:')), legacyItems);
    assert.equal(saved.items.filter(row => row.cardId.startsWith('tcgdex:')).length, 3);
    assert.equal(saved.trial.successfulRecognitions, 0);
  });

  await check('preexisting Phase A pending rows remain separate and Organize saves the original legacy identity once', async () => {
    await go(page, '/organize'); await text(page, '2 pending cards').waitFor();
    const before = await stored(page);
    assert.equal((await stored(page, sessionKey)).items[0].cardId, 'xy12-35-reverse');
    await button(page, 'Details for pending Pikachu, Reverse holo').click();
    await button(page, 'Return to Organize').waitFor();
    assert.equal(await button(page, /^(Add to collection|Add one copy)$/).count(), 0);
    await button(page, 'Return to Organize').click();
    assert.deepEqual(await stored(page), before);
    await button(page, 'Save all to Collection').click(); await text(page, '2 copies saved to Collection.').waitFor();
    const saved = await stored(page);
    assert.equal(saved.items.find(row => row.cardId === 'xy12-35-reverse')?.quantity, 2);
    assert.equal(saved.items.find(row => row.cardId === catalogKey('xy12-35', 'reverse'))?.quantity, 1);
    assert.ok(saved.savedScanOperations.includes('legacy-pending-operation'));
    await page.reload({ waitUntil: 'domcontentloaded' }); await text(page, 'No pending cards').waitFor();
    assert.deepEqual(await stored(page), saved, 'Reload must not replay old pending receipts.');
  });
  await context.close();

  const cached = await fixture(); activePage = cached.page;
  await check('expired cached search remains visible when the provider fails and can refresh after reconnecting', async () => {
    await go(cached.page, '/search?query=Charizard'); await text(cached.page, '1 result').waitFor();
    await cached.context.addInitScript(() => { const now = Date.now; Date.now = () => now() + 7 * 24 * 60 * 60 * 1000; });
    cached.network.offline = true;
    await cached.page.reload({ waitUntil: 'domcontentloaded' });
    await text(cached.page, 'Saved results · could not refresh the catalog.').waitFor();
    await button(cached.page, /^View Charizard,/).waitFor();
    assert.deepEqual((await stored(cached.page)).items, []);
    await go(cached.page, `/card/${encodeURIComponent(catalogKey('base1-4'))}`);
    await assertQuote(cached.page, '$245.00');
    await button(cached.page, 'Retry card details').waitFor();
    assert.deepEqual((await stored(cached.page)).items, [], 'An unowned cached detail must not create ownership.');
    await go(cached.page, '/search?query=Charizard');
    await text(cached.page, 'Saved results · could not refresh the catalog.').waitFor();
    cached.network.offline = false;
    await button(cached.page, 'Retry catalog').click();
    await text(cached.page, 'Saved results · could not refresh the catalog.').waitFor({ state: 'hidden' });
    await button(cached.page, /^View Charizard,/).waitFor();
  });
  await cached.context.close();

  const failed = await fixture({ offline: true }); activePage = failed.page;
  await check('uncached network failure reports a recoverable error and never substitutes sample cards', async () => {
    await go(failed.page, '/search?query=Charizard'); await text(failed.page, 'Catalog unavailable').waitFor();
    assert.equal(await tiles(failed.page).count(), 0);
    assert.deepEqual((await stored(failed.page)).items, []);
    failed.network.offline = false;
    await button(failed.page, 'Try again').click(); await text(failed.page, '1 result').waitFor();
    await openCard(failed.page, 'Charizard'); await assertQuote(failed.page, '$245.00');
    assert.ok(failed.network.requests.some(value => new URL(value).pathname.endsWith('/cards/base1-4')));
    failed.network.offline = true;
    await go(failed.page, `/card/${encodeURIComponent(catalogKey('xy12-35', 'normal'))}`);
    await text(failed.page, 'Card unavailable').waitFor();
    assert.equal(await button(failed.page, 'Add to collection').count(), 0);
    failed.network.offline = false;
    await button(failed.page, 'Try again').click();
    await assertQuote(failed.page, '$1.25', 'Normal');
    assert.deepEqual((await stored(failed.page)).items, []);
  });
  await failed.context.close();
  const directory = await fixture({ offline: true }); activePage = directory.page;
  await check('the expansion directory retries network errors and missing logos keep their set accessible', async () => {
    await go(directory.page, '/search'); await text(directory.page, 'Sets unavailable').waitFor();
    directory.network.offline = false; directory.network.brokenLogos = true;
    await button(directory.page, 'Try again').click();
    await text(directory.page, `${fixtureSets.length} sets`).waitFor();
    await button(directory.page, 'Browse Base Set').waitFor();
    await directory.page.getByRole('img', { name: 'Base Set logo unavailable', exact: true }).waitFor();
    await directory.page.screenshot({ path: '/tmp/chase-sets-directory.png' });
    await button(directory.page, 'Browse Base Set').click(); await text(directory.page, '24 of 26 cards').waitFor();
    assert.deepEqual((await stored(directory.page)).items, []);
  });
  await directory.context.close();
  console.log(`Catalog workflow passed: ${passed} scenarios; intercepted provider REST requests, no runtime errors.`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: '/tmp/chase-catalog-failure.png' }).catch(() => {});
    console.error(`Active URL: ${activePage.url()}`);
    console.error((await activePage.locator('body').innerText()).slice(-3500));
  }
  console.error(error); process.exitCode = 1;
} finally { await browser?.close(); }
