/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardArtworkSources } from '../src/services/tcgdex/artwork';
import { normalizeCards } from '../src/services/tcgdex/normalize';
import { validateCatalogSnapshot } from '../src/data/catalogRegistry';
import { appendRecognition, createScanSession, restoreScanSession } from '../src/services/scanSession';

const base = 'https://assets.tcgdex.net/en/me/me04/087';
const raw = (image: string) => ({ id: 'me04-087', name: 'Chespin', localId: '087',
  set: { id: 'me04', name: 'Chaos Rising', cardCount: { official: 86 } }, variants: { holo: true }, image });

test('TCGdex artwork tries bounded encodings of the advertised printing only', () => {
  assert.deepEqual(cardArtworkSources(base), ['high.webp', 'high.png', 'low.webp', 'low.png'].map(file => `${base}/${file}`));
  assert.equal(cardArtworkSources(`${base}/high.png`)[0], `${base}/high.png`);
  assert.equal(cardArtworkSources(`${base}/low.webp`)[0], `${base}/low.webp`);
  assert.equal(new Set(cardArtworkSources(`${base}/high.webp`)).size, 4);
  assert.deepEqual(cardArtworkSources('https://example.com/card.png'), ['https://example.com/card.png']);
  assert.deepEqual(cardArtworkSources(undefined), []);
  assert.deepEqual(cardArtworkSources('http://assets.tcgdex.net/card'), []);
  assert.deepEqual(cardArtworkSources('file:///card.webp'), []);
});

test('complete and persisted malformed image paths resolve without appending a second size', () => {
  assert.equal(normalizeCards(raw(`${base}/high.png`), 'en')[0].imageUrl, `${base}/high.png`);
  assert.equal(normalizeCards(raw(base), 'en')[0].imageUrl, `${base}/high.webp`);
  const old = normalizeCards(raw(base), 'en')[0];
  old.imageUrl = `${base}/high.webp/high.webp`;
  assert.ok(validateCatalogSnapshot(old, old.id), 'old snapshots remain readable without changing their identity');
  assert.equal(cardArtworkSources(old.imageUrl)[0], `${base}/high.webp`);
});

test('recognized artwork remains available in a session snapshot after persistence and quantity merging', () => {
  const card = normalizeCards(raw(`${base}/high.png`), 'en')[0];
  let session = appendRecognition(createScanSession('artwork'), card, 'first', '2026-10-25T00:00:00Z', false);
  session = appendRecognition(session, card, 'second', '2026-10-25T00:00:01Z', false);
  const restored = restoreScanSession(JSON.parse(JSON.stringify(session)), 'fallback');
  assert.equal(restored.items[0].quantity, 2);
  assert.equal(restored.items[0].card?.imageUrl, `${base}/high.png`);
  assert.equal(restored.items[0].card?.id, card.id);
  assert.equal(restored.items[0].card?.marketPrice, null, 'artwork recovery never invents a price');
});
