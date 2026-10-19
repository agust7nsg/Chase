// These browser-only fixtures use TCGdex REST payloads. The app still calls its
// real HTTP adapter; no production catalog or network fallback is installed.
import { Buffer } from 'node:buffer';

export const catalogSearchLabel = 'Search cards by name, set, or collector number';
export const catalogKey = (id, variant = 'holo') => `tcgdex:en:${id}:${variant}`;
export const quoteUpdatedAt = '2026-10-01T00:00:00.000Z';

const setDefinitions = [
  ['base1', 'Base Set', 102, 'base'], ['base4', 'Base Set 2', 130, 'base'],
  ['xy12', 'Evolutions', 108, 'xy'], ['swsh7', 'Evolving Skies', 203, 'swsh'],
  ['swsh8', 'Fusion Strike', 264, 'swsh'], ['swsh11', 'Lost Origin', 196, 'swsh'],
  ['swsh12', 'Silver Tempest', 195, 'swsh'], ['sv2', 'Paldea Evolved', 193, 'sv'],
  ['xyp', 'XY Black Star Promos', 211, 'xy'], ['sv6', 'Twilight Masquerade', 167, 'sv'],
  ['mcd11', "McDonald's Collection 2011", 25, 'mcd'],
  ['30th', '30th Celebration', 128, 'me'], ['30th-c', '30th Classic Collection', 30, 'me'],
];
const releaseDates = { base1: '1999-01-09', base4: '2000-02-24', xy12: '2016-11-02', swsh7: '2021-08-27', swsh8: '2021-11-12', swsh11: '2022-09-09', swsh12: '2022-11-11', sv2: '2023-06-09', xyp: '2014-02-05', sv6: '2024-05-24', mcd11: '2011-06-17', '30th': '2026-09-16', '30th-c': '2026-09-16' };
export const fixtureSets = setDefinitions.map(([id, name, official, prefix]) => ({ id, name, releaseDate: releaseDates[id], logo: id === '30th-c' ? undefined : `https://assets.tcgdex.net/en/${prefix}/${id}/logo`, cardCount: { official, total: official } }));
const sets = new Map(fixtureSets.map(set => [set.id, set]));
const series = new Map(setDefinitions.map(([id, , , prefix]) => [id, prefix]));

function printing(id, name, setId, localId, amount, variants = { normal: false, holo: true, reverse: false, firstEdition: false, wPromo: false }, extra = {}) {
  const set = sets.get(setId);
  return {
    id, localId, name, image: `https://assets.tcgdex.net/en/${series.get(setId)}/${setId}/${localId}`,
    category: 'Pokemon', rarity: 'Rare', illustrator: 'Fixture artist',
    hp: 60, types: ['Colorless'], stage: 'Basic',
    set: { ...set }, variants,
    ...(amount === null ? {} : { pricing: { tcgplayer: {
      updated: quoteUpdatedAt, unit: 'USD',
      [variants.normal ? 'normal' : 'holofoil']: { lowPrice: amount - 0.1, midPrice: amount + 1, highPrice: amount + 100, marketPrice: amount, directLowPrice: amount + 2 },
    } } }),
    ...extra,
  };
}

const fixturePrintings = [
  printing('30th-001', 'Exeggcute', '30th', '001', 0.12),
  printing('30th-002', 'Exeggutor', '30th', '002', 0.35),
  printing('30th-R', 'Mew', '30th', 'R', 950),
  printing('30th-G', 'Mew', '30th', 'G', 870),
  printing('30th-B', 'Mew', '30th', 'B', 900),
  printing('30th-c-001', 'Venusaur', '30th-c', '001', 30),
  printing('mcd11-1', 'Bulbasaur', 'mcd11', '1', null, { normal: true, holo: false, reverse: false, firstEdition: false, wPromo: false }, { image: undefined }),
  printing('base1-4', 'Charizard', 'base1', '4', 245),
  printing('xy12-35', 'Pikachu', 'xy12', '35', 1.25,
    { normal: true, holo: false, reverse: true, firstEdition: false, wPromo: false },
    { pricing: {
      tcgplayer: { updated: quoteUpdatedAt, unit: 'USD', normal: { lowPrice: 1, midPrice: 2, highPrice: 999, marketPrice: 1.25 }, 'reverse-holofoil': { lowPrice: 3, midPrice: 5, highPrice: 999, marketPrice: 4.2 } },
      cardmarket: { updated: quoteUpdatedAt, unit: 'EUR', avg: 0.99, low: 0.5, trend: 1.1, avg1: 1, avg7: 1, avg30: 1, 'avg-holo': 3.2, 'low-holo': 2.5, 'trend-holo': 3.5, 'avg1-holo': 3.2, 'avg7-holo': 3.2, 'avg30-holo': 3.2 },
    } }),
  printing('swsh7-215', 'Umbreon VMAX', 'swsh7', '215', 650),
  printing('swsh7-218', 'Rayquaza VMAX', 'swsh7', '218', 280),
  printing('swsh7-192', 'Dragonite V', 'swsh7', '192', 95),
  printing('swsh8-271', 'Gengar VMAX', 'swsh8', '271', 310),
  printing('swsh11-186', 'Giratina V', 'swsh11', '186', 290),
  printing('swsh12-186', 'Lugia V', 'swsh12', '186', 155),
  printing('sv2-203', 'Magikarp', 'sv2', '203', 85),
  printing('xyp-XY133', 'Ash-Greninja EX', 'xyp', 'XY133', 28),
  printing('sv6-214', 'Greninja ex', 'sv6', '214', 300),
  printing('swsh8-269', 'Mew VMAX', 'swsh8', '269', 120),
  printing('base1-63', 'Squirtle', 'base1', '63', null, { normal: true, holo: false, reverse: false, firstEdition: false, wPromo: false }),
  ...[
    ['1', 'Alakazam'], ['2', 'Blastoise'], ['3', 'Chansey'], ['5', 'Clefairy'], ['6', 'Gyarados'],
    ['7', 'Hitmonchan'], ['8', 'Machamp'], ['9', 'Magneton'], ['10', 'Mewtwo'], ['11', 'Nidoking'],
    ['12', 'Ninetales'], ['13', 'Poliwrath'], ['14', 'Raichu'], ['15', 'Venusaur'], ['16', 'Zapdos'],
    ['17', 'Beedrill'], ['18', 'Dragonair'], ['19', 'Dugtrio'], ['20', 'Electabuzz'], ['21', 'Electrode'],
    ['22', 'Pidgeotto'], ['23', 'Arcanine'], ['24', 'Charmeleon'], ['25', 'Dewgong'],
  ].map(([localId, name]) => printing(`base1-${localId}`, name, 'base1', localId, Number(localId) + 10)),
];
export const fixtureCards = new Map(fixturePrintings.map(card => [card.id, card]));
const brief = ({ id, localId, name, image }) => ({ id, localId, name, image });
const decodeFilter = value => (value ?? '').replace(/^(?:like|eq):/i, '').replace(/[%*]/g, '').toLowerCase();

/** Every API/image request is intercepted so browser checks never need TCGdex access. */
export async function installTCGdexFixtures(context) {
  const state = { offline: false, requests: [], failures: [], failNext: null, brokenLogos: false };
  await context.route('https://assets.tcgdex.net/**', route => (state.brokenLogos && route.request().url().includes('/logo.')) || route.request().url().endsWith('/me/30th/logo.webp') ? route.abort('failed') : route.fulfill({
    contentType: 'image/png',
    headers: { 'access-control-allow-origin': '*' },
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=', 'base64'),
  }));
  await context.route('https://api.tcgdex.net/**', async route => {
    const url = new URL(route.request().url());
    state.requests.push(url.href);
    if (state.offline || (state.failNext && state.failNext(url))) {
      state.failNext = null;
      await route.abort('failed');
      return;
    }
    const path = decodeURIComponent(url.pathname.replace(/^\/v2\/en\/?/, ''));
    const respond = value => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(value) });
    if (path === 'sets') {
      const name = decodeFilter(url.searchParams.get('name'));
      const result = fixtureSets.filter(set => !name || set.name.toLowerCase().includes(name));
      if (url.searchParams.get('sort:field') === 'releaseDate' && url.searchParams.get('sort:order') === 'DESC') result.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
      return respond(result.map(({ releaseDate, ...set }) => set));
    }
    if (path.startsWith('sets/')) {
      const set = sets.get(path.slice(5));
      if (set) return respond({ ...set, serie: { id: series.get(set.id), name: 'Fixture series' }, cards: fixturePrintings.filter(card => card.set.id === set.id).map(brief) });
    }
    if (path.startsWith('cards/')) {
      const card = fixtureCards.get(path.slice(6));
      if (card) return respond(card);
      return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'Card not found' }) });
    }
    if (path === 'cards') {
      const name = decodeFilter(url.searchParams.get('name'));
      const localId = decodeFilter(url.searchParams.get('localId'));
      const setId = decodeFilter(url.searchParams.get('set.id'));
      const setName = decodeFilter(url.searchParams.get('set.name'));
      const matches = fixturePrintings.filter(card => (!name || card.name.toLowerCase().includes(name))
        && (!localId || card.localId.toLowerCase() === localId)
        && (!setId || card.set.id.toLowerCase() === setId)
        && (!setName || card.set.name.toLowerCase().includes(setName)));
      if (url.searchParams.get('sort:field') === 'id') matches.sort((left, right) => left.id.localeCompare(right.id));
      const page = Number(url.searchParams.get('pagination:page') ?? 1);
      const pageSize = Number(url.searchParams.get('pagination:itemsPerPage') ?? matches.length);
      return respond(matches.slice((page - 1) * pageSize, page * pageSize).map(brief));
    }
    state.failures.push(url.href);
    return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'Unexpected fixture request' }) });
  });
  return state;
}
