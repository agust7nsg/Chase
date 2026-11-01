import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { CollectionSyncStore, COLLECTION_STORAGE_KEY, type CollectionCloud } from '../src/services/collections/store';
import { accountOf, restoreDevice, type CollectionOperation, type RemoteRow } from '../src/services/collections/model';
import { addCard, setQuantity, removeCard } from '../src/services/domain';
import { saveScanItems, appendRecognition, createScanSession } from '../src/services/scanSession';
import { getLegacyCard } from '../src/data/mocks/catalog';

const a = '12345678-1234-1234-1234-123456789abc'; const b = '12345678-1234-1234-1234-123456789def';
const seed = { onboardingComplete: true, plan: 'free', trial: { successfulRecognitions: 1 }, items: [{ cardId: 'base1-4', quantity: 2, addedAt: '2026-10-21T00:00:00Z' }] };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
class Cloud implements CollectionCloud {
  rows = new Map<string, Map<string, RemoteRow>>(); receipts = new Map<string, { status: 'ok' | 'conflict'; row: RemoteRow }>();
  offline = false; loseReply = false; writes = 0;
  async read(owner: string) { if (this.offline) throw new Error('offline'); return clone([...this.rows.get(owner)?.values() ?? []]); }
  async apply(owner: string, op: CollectionOperation) {
    if (this.offline) throw new Error('offline');
    const key = owner + op.id; const receipt = this.receipts.get(key); if (receipt) return clone(receipt);
    const rows = this.rows.get(owner) ?? new Map(); this.rows.set(owner, rows);
    const current = rows.get(op.cardId) ?? { cardId: op.cardId, revision: 0, item: null };
    const result = current.revision !== op.baseRevision ? { status: 'conflict' as const, row: current }
      : { status: 'ok' as const, row: { cardId: op.cardId, revision: current.revision + 1, item: clone(op.item) } };
    if (result.status === 'ok') { rows.set(op.cardId, result.row); this.writes++; }
    this.receipts.set(key, clone(result));
    if (this.loseReply) { this.loseReply = false; throw new Error('reply lost'); }
    return clone(result);
  }
}
async function device(cloud = new Cloud(), initial: unknown = seed) {
  const values = new Map([[COLLECTION_STORAGE_KEY, JSON.stringify(initial)]]); let fail = false;
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { if (fail) throw new Error('disk full'); values.set(key, value); } };
  const store = new CollectionSyncStore(storage, randomUUID, () => {}, cloud); await store.load();
  return { store, cloud, values, storage, fail: (value = true) => { fail = value; }, restart: async () => { const next = new CollectionSyncStore(storage, randomUUID, () => {}, cloud); await next.load(); return next; } };
}
const quantity = (store: CollectionSyncStore, id = 'base1-4') => store.view().items.find(item => item.cardId === id)?.quantity ?? 0;

test('legacy guest state is unchanged, and sign-in never uploads/assigns it without import consent', async () => {
  const run = await device(); assert.deepEqual(run.store.view(), seed);
  run.store.select(a); assert.equal(quantity(run.store), 0); await run.store.sync();
  assert.equal(run.cloud.writes, 0); assert.deepEqual(run.store.raw.items, seed.items);
  assert.equal(accountOf(run.store.raw, a).importDecision, 'pending');
  run.store.select(null); assert.equal(quantity(run.store), 2);
});
test('explicit import merges quantities once, survives retry/restart, and retains guest originals', async () => {
  const run = await device(); run.store.select(a); await run.store.update(current => addCard(current, 'base1-4'));
  await run.store.importGuest(); await run.store.importGuest(); assert.equal(quantity(run.store), 3);
  await run.store.sync(); const next = await run.restart(); next.select(a); await next.importGuest(); await next.sync();
  assert.equal(quantity(next), 3); next.select(null); assert.equal(quantity(next), 2);
  assert.equal(run.cloud.rows.get(a)?.get('base1-4')?.item?.quantity, 3);
});
test('declining import remains explicit and Free cannot import above 50 copies', async () => {
  const run = await device(undefined, { ...seed, items: [{ ...seed.items[0], quantity: 50 }] });
  run.store.select(a); await run.store.declineImport(); await run.store.update(current => addCard(current, 'base1-4'));
  await assert.rejects(run.store.importGuest(), /50/); assert.equal(quantity(run.store), 1);
  assert.equal(accountOf(run.store.raw, a).importDecision, 'declined'); assert.equal(run.store.raw.items[0].quantity, 50);
});
test('accounts and guest inventories remain isolated across logout, switching and restarts', async () => {
  const run = await device(); run.store.select(a); await run.store.update(current => addCard(current, 'base1-2'));
  run.store.select(b); assert.equal(run.store.view().items.length, 0); await run.store.update(current => addCard(current, 'base1-15'));
  await run.store.sync(); const next = await run.restart(); next.select(a); assert.equal(next.view().items[0].cardId, 'base1-2');
  next.select(b); assert.equal(next.view().items[0].cardId, 'base1-15'); next.select(null); assert.equal(quantity(next), 2);
});
test('offline quantity edits persist in an outbox and replay in order with no self-conflict', async () => {
  const run = await device(); run.store.select(a); run.cloud.offline = true;
  await run.store.update(current => addCard(current, 'base1-4')); await run.store.update(current => setQuantity(current, 'base1-4', 7));
  await run.store.sync(); assert.ok(run.store.syncError); const next = await run.restart(); next.select(a); assert.equal(quantity(next), 7);
  run.cloud.offline = false; await next.sync(); assert.equal(accountOf(next.raw, a).pending.length, 0); assert.equal(Object.keys(accountOf(next.raw, a).conflicts).length, 0);
  assert.equal(run.cloud.rows.get(a)?.get('base1-4')?.item?.quantity, 7);
});
test('two devices combine independent cards and restore the complete collection', async () => {
  const cloud = new Cloud(); const left = await device(cloud); const right = await device(cloud);
  left.store.select(a); right.store.select(a);
  await left.store.update(current => addCard(current, 'base1-4')); await right.store.update(current => addCard(current, 'base1-2'));
  await Promise.all([left.store.sync(), right.store.sync()]); await left.store.sync(); await right.store.sync();
  assert.deepEqual(left.store.view().items.map(item => item.cardId).sort(), ['base1-2', 'base1-4']);
  assert.deepEqual([...right.store.view().items].sort((a,b)=>a.cardId.localeCompare(b.cardId)), [...left.store.view().items].sort((a,b)=>a.cardId.localeCompare(b.cardId)));
});
test('same-card edits require explicit quantity resolution, rather than silently losing copies', async () => {
  const cloud = new Cloud(); const left = await device(cloud); const right = await device(cloud); left.store.select(a); right.store.select(a);
  await left.store.update(current => addCard(current, 'base1-4')); await left.store.sync(); await right.store.sync();
  await left.store.update(current => setQuantity(current, 'base1-4', 2)); await right.store.update(current => setQuantity(current, 'base1-4', 3));
  await left.store.sync(); await right.store.sync(); assert.equal(quantity(right.store), 3); assert.ok(accountOf(right.store.raw, a).conflicts['base1-4']);
  await right.store.resolve('base1-4', true); await right.store.sync(); await left.store.sync(); assert.equal(quantity(left.store), 3);
});
test('accepting a cloud deletion discards only conflicting local edits and does not resurrect a tombstone', async () => {
  const cloud = new Cloud(); const left = await device(cloud); const right = await device(cloud); left.store.select(a); right.store.select(a);
  await left.store.update(current => addCard(current, 'base1-4')); await left.store.sync(); await right.store.sync();
  await left.store.update(current => removeCard(current, 'base1-4')); await right.store.update(current => setQuantity(current, 'base1-4', 4));
  await left.store.sync(); await right.store.sync(); await right.store.resolve('base1-4', false); await right.store.sync();
  assert.equal(quantity(right.store), 0); assert.equal(cloud.rows.get(a)?.get('base1-4')?.item, null);
  const next = await right.restart(); next.select(a); await next.sync(); assert.equal(quantity(next), 0);
});
test('a lost server reply retries the exact operation ID without doubling ownership', async () => {
  const run = await device(); run.store.select(a); await run.store.update(current => addCard(current, 'base1-4'));
  run.cloud.loseReply = true; await run.store.sync(); const id = accountOf(run.store.raw, a).pending[0].id;
  assert.ok(run.cloud.receipts.has(a + id)); await run.store.sync(); assert.equal(run.cloud.writes, 1); assert.equal(quantity(run.store), 1);
});
test('failed local writes never acknowledge a save or change the durable inventory', async () => {
  const run = await device(); run.store.select(a); run.fail();
  await assert.rejects(run.store.update(current => addCard(current, 'base1-4'))); assert.equal(quantity(run.store), 0);
  assert.deepEqual(JSON.parse(run.values.get(COLLECTION_STORAGE_KEY)!), seed); run.fail(false);
  await run.store.update(current => addCard(current, 'base1-4')); await run.store.sync(); assert.equal(quantity(run.store), 1);
});
test('a failed local acknowledgement after server success replays the durable receipt safely', async () => {
  const run = await device(); run.store.select(a); await run.store.update(current => addCard(current, 'base1-4'));
  const apply = run.cloud.apply.bind(run.cloud);
  run.cloud.apply = async (owner, op) => { const result = await apply(owner, op); run.fail(); return result; };
  await run.store.sync(); assert.equal(accountOf(run.store.raw, a).pending.length, 1); assert.equal(run.cloud.writes, 1);
  run.fail(false); run.cloud.apply = apply; await run.store.sync(); assert.equal(run.cloud.writes, 1); assert.equal(accountOf(run.store.raw, a).pending.length, 0);
});
test('Organize saves write local inventory, outbox and global receipts atomically, without syncing pending scans', async () => {
  const run = await device(); run.store.select(a);
  const pending = appendRecognition(createScanSession('session'), getLegacyCard('base1-4')!, 'op-scan', new Date().toISOString(), false);
  run.values.set('chase.scan-session.v1', JSON.stringify(pending));
  await run.store.update(current => saveScanItems(current, pending.items).state); run.store.select(b);
  await run.store.update(current => saveScanItems(current, pending.items).state);
  assert.equal(quantity(run.store), 0); run.store.select(a); assert.equal(quantity(run.store), 1);
  assert.equal(run.values.get('chase.scan-session.v1'), JSON.stringify(pending));
  const raw = JSON.parse(run.values.get(COLLECTION_STORAGE_KEY)!); assert.ok(raw.savedScanOperations.length); assert.equal(raw.collectionSync.accounts[a].pending.length, 1);
});
test('invalid account snapshots fail recovery without silently deleting saved cards', async () => {
  const run = await device(); run.store.select(a); await run.store.update(current => addCard(current, 'base1-4'));
  const raw = JSON.parse(run.values.get(COLLECTION_STORAGE_KEY)!); raw.collectionSync.accounts[a].items[0].quantity = 9;
  assert.throws(() => restoreDevice(raw), /recovery/);
});
test('an account switch during an in-flight sync cannot send the old outbox as the new owner', async () => {
  const cloud = new Cloud(); const run = await device(cloud); run.store.select(a); await run.store.update(current => addCard(current, 'base1-4'));
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const read = cloud.read.bind(cloud); cloud.read = async owner => { await gate; return read(owner); };
  const syncing = run.store.sync(); run.store.select(b); release(); await syncing;
  assert.equal(cloud.writes, 0); assert.equal(run.store.view().items.length, 0); assert.equal(accountOf(run.store.raw, a).pending.length, 1);
});

test('account deletion forgets only its replica and preserves guest, other owners and installation receipts', async () => {
  const run = await device(undefined, { ...seed, savedScanOperations: ['saved-installation-operation'] }); run.store.select(a); await run.store.update(current => addCard(current, 'base1-2'));
  run.store.select(b); await run.store.update(current => addCard(current, 'base1-15'));
  const before = clone(run.store.raw); await run.store.forgetAccount(a);
  assert.equal(run.store.raw.collectionSync?.accounts[a], undefined);
  assert.deepEqual(run.store.raw.collectionSync?.accounts[b], before.collectionSync?.accounts[b]);
  assert.deepEqual(run.store.raw.items, before.items); assert.deepEqual(run.store.raw.trial, before.trial);
  assert.deepEqual(run.store.raw.savedScanOperations, before.savedScanOperations);
  run.store.select(a); await assert.rejects(run.store.update(current => addCard(current, 'base1-2')), /deletion/);
  await assert.rejects(run.store.importGuest(), /deletion/);
});
test('late in-flight cloud pulls cannot recreate a deleted local replica', async () => {
  const run = await device(); run.store.select(a); await run.store.update(current => addCard(current, 'base1-4'));
  let release!: (rows: RemoteRow[]) => void;
  run.cloud.read = () => new Promise(resolve => { release = resolve; });
  const pull = run.store.sync(); await run.store.forgetAccount(a);
  release([{ cardId: 'base1-4', revision: 100, item: seed.items[0] }]); await pull;
  assert.equal(run.store.raw.collectionSync?.accounts[a], undefined); assert.deepEqual(run.store.raw.items, seed.items);
});
test('late cloud mutation acknowledgements cannot recreate deleted outbox metadata', async () => {
  const run = await device(); run.store.select(a); await run.store.update(current => addCard(current, 'base1-4'));
  let release!: (value: { status: 'ok'; row: RemoteRow }) => void;
  run.cloud.apply = () => new Promise(resolve => { release = resolve; });
  const sync = run.store.sync(); while (!release) await new Promise(r => setTimeout(r, 0));
  await run.store.forgetAccount(a); release({ status: 'ok', row: { cardId: 'base1-4', revision: 1, item: seed.items[0] } }); await sync;
  assert.equal(run.store.raw.collectionSync?.accounts[a], undefined); assert.deepEqual(run.store.raw.items, seed.items);
});
