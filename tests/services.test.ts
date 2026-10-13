/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { canScan, initialState, recordSuccessfulScan } from '../src/services/domain';
import {
  MockCardCatalogService,
  MockCardRecognitionService,
  MockCollectionRepository,
  MockMarketPricingService,
  MockSubscriptionService,
} from '../src/services/mocks';
import type { Collection, PrototypeState } from '../src/types/domain';

test('recognition failure leaves the trial available, and only success consumes it', async () => {
  const service = new MockCardRecognitionService(0);
  let state: PrototypeState = { ...initialState, trial: { successfulRecognitions: 0 }, items: [] };
  await assert.rejects(service.recognize({ simulateFailure: true }), /No card recognized/);
  assert.equal(canScan(state), true);
  const card = await service.recognize();
  assert.equal(card.id, 'base1-4');
  state = recordSuccessfulScan(state);
  assert.equal(canScan(state), false);
});

test('catalog supports name, set, number, and variant search and protects mock data', async () => {
  const service = new MockCardCatalogService();
  assert.equal((await service.searchCards('  PIKACHU  ')).length, 2);
  assert.equal((await service.searchCards('Reverse holo')).length, 1);
  assert.equal((await service.searchCards('35/108')).length, 2);
  assert.equal((await service.searchCards('Base Set 2')).length, 1);
  assert.deepEqual(await service.searchCards('not a card'), []);
  assert.equal(await service.getCard('unknown'), undefined);
  const cards = await service.listCards();
  cards[0].marketPrice.amount = 0;
  assert.equal((await service.getCard('base1-4'))?.marketPrice.amount, 245);
});

test('pricing is explicitly mock, copied, and fails for unknown cards', async () => {
  const service = new MockMarketPricingService();
  const price = await service.getPrice('base1-4');
  assert.deepEqual(price, { amount: 245, currency: 'USD', source: 'mock', updatedAt: '2026-10-01T00:00:00.000Z' });
  price.amount = 0;
  assert.equal((await service.getPrice('base1-4')).amount, 245);
  await assert.rejects(service.getPrice('unknown'), /not in the catalog/);
});

test('collection repository saves, updates, removes, and isolates returned snapshots', async () => {
  const repository = new MockCollectionRepository();
  const collection: Collection = {
    id: 'main', name: 'My collection', createdAt: '2026-10-01T00:00:00.000Z',
    items: [{ cardId: 'base1-4', quantity: 1, addedAt: '2026-10-01T00:00:00.000Z' }],
  };
  await repository.save(collection);
  collection.items[0].quantity = 9;
  const saved = await repository.list();
  assert.equal(saved[0].items[0].quantity, 1);
  saved[0].items[0].quantity = 3;
  assert.equal((await repository.list())[0].items[0].quantity, 1);
  await repository.save({ ...collection, name: 'Updated collection' });
  assert.equal((await repository.list()).length, 1);
  assert.equal((await repository.list())[0].name, 'Updated collection');
  await repository.remove('main');
  assert.deepEqual(await repository.list(), []);
});

test('mock subscriptions update entitlement without a purchase integration', async () => {
  const service = new MockSubscriptionService();
  assert.equal((await service.getEntitlement()).plan, 'free');
  const pro = await service.setPlan('pro');
  assert.equal(pro.unlimitedScans, true);
  assert.equal(pro.csvExport, true);
  assert.equal(pro.gradedPrices, true);
  assert.equal(pro.multipleCollections, true);
  assert.equal(pro.maxCards, null);
  assert.equal((await service.getEntitlement()).plan, 'pro');
});
