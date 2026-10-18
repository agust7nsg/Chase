/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { getCatalogCard } from '../src/data/mocks/catalog';
import { FEATURED_CARD_IDS, nextFeaturedCard } from '../src/services/featuredCards';
import { addCard, initialState, normalizeStoredState } from '../src/services/domain';

test('Home pool contains only the three requested printings, including the distinct Twilight Greninja', () => {
  assert.deepEqual(FEATURED_CARD_IDS, ['swsh7-192', 'sv6-214', 'swsh7-215']);
  assert.ok(FEATURED_CARD_IDS.every(id => getCatalogCard(id)));
  const greninja = getCatalogCard('sv6-214')!;
  assert.equal(greninja.name, 'Greninja ex');
  assert.equal(greninja.setName, 'Twilight Masquerade');
  assert.equal(greninja.collectorNumber, '214/167');
  assert.notEqual(greninja.id, getCatalogCard('xyp-XY133')!.id);
  const owned = addCard(initialState, greninja.id);
  assert.equal(normalizeStoredState(JSON.parse(JSON.stringify(owned))).items[0].cardId, greninja.id);
});

test('random draws cover the whole pool and never repeat within or across cycle boundaries', () => {
  for (const random of [() => 0, () => 0.5, () => 0.999999, Math.random]) {
    let stored: string | null = null;
    let last: string | undefined;
    for (let cycle = 0; cycle < 40; cycle += 1) {
      const drawn = [];
      for (let index = 0; index < FEATURED_CARD_IDS.length; index += 1) {
        const result = nextFeaturedCard(stored, random);
        assert.notEqual(result.cardId, last);
        assert.ok(FEATURED_CARD_IDS.includes(result.cardId));
        drawn.push(result.cardId);
        stored = JSON.stringify(result.rotation);
        last = result.cardId;
      }
      assert.deepEqual(drawn.sort(), [...FEATURED_CARD_IDS].sort());
    }
  }
});

test('randomness can select each first card, rather than forcing a fixed rotation', () => {
  assert.deepEqual([0, 0.5, 0.999999].map(value => nextFeaturedCard(null, () => value).cardId), [...FEATURED_CARD_IDS]);
});

test('a saved partially consumed cycle resumes instead of reintroducing seen cards', () => {
  const stored = JSON.stringify({ lastId: 'swsh7-192', remaining: ['sv6-214'] });
  const next = nextFeaturedCard(stored, () => 0.9);
  assert.equal(next.cardId, 'sv6-214');
  assert.deepEqual(next.rotation.remaining, []);
  assert.notEqual(nextFeaturedCard(JSON.stringify(next.rotation), () => 0.5).cardId, next.cardId);
});

test('corrupt rotation storage resets safely and cannot introduce unrelated cards', () => {
  for (const stored of ['broken json', 'null', '[]', '{}', JSON.stringify({ lastId: 'xyp-XY133', remaining: ['base1-4'] }), JSON.stringify({ lastId: 'swsh7-192', remaining: ['sv6-214', 'sv6-214'] }), JSON.stringify({ lastId: 'swsh7-192', remaining: ['swsh7-192'] })]) {
    const next = nextFeaturedCard(stored, () => 0);
    assert.equal(next.cardId, 'swsh7-192');
    assert.deepEqual(next.rotation.remaining, ['sv6-214', 'swsh7-215']);
  }
});
