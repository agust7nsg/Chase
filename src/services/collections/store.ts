import type { PrototypeState } from '../../types/domain';
import type { SessionStorage } from '../scanSessionStore';
import { accountOf, collectionView, emptyDevice, importGuest, mergeRows, resolveConflict, restoreDevice, settle, stageView, uuid, withAccount, type CollectionOperation, type DeviceState, type RemoteRow } from './model';
export const COLLECTION_STORAGE_KEY = 'chase.prototype.v1';
export interface CollectionCloud {
  read(owner: string): Promise<RemoteRow[]>;
  apply(owner: string, operation: CollectionOperation): Promise<{ status: 'ok' | 'conflict'; row: RemoteRow }>;
}
/** One atomic device file stores guest rows, isolated account replicas, outbox and global scan receipts. */
export class CollectionSyncStore {
  raw: DeviceState = emptyDevice(); owner: string | null = null; loaded = false;
  persistenceError: string | null = null; syncError: string | null = null; syncing = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: SessionStorage, private id: () => string, private publish: () => void, private cloud: CollectionCloud | null) {}
  setPublisher(publish: () => void) { this.publish = publish; }
  view() { return collectionView(this.raw, this.owner); }
  async load(development = true) {
    const value = await this.storage.getItem(COLLECTION_STORAGE_KEY);
    this.raw = value ? restoreDevice(JSON.parse(value)) : emptyDevice();
    if (!development) this.raw.plan = 'free';
    this.loaded = true; this.publish();
  }
  select(owner: string | null) { if (owner && !uuid(owner)) throw new Error('Invalid account identity.'); this.owner = owner; this.syncError = null; this.publish(); }
  private transaction(transform: (raw: DeviceState) => DeviceState) {
    const work = this.queue.then(async () => {
      if (!this.loaded) throw new Error('Collection is still loading.');
      const next = transform(this.raw);
      await this.storage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(next));
      this.raw = next; this.persistenceError = null; this.publish();
    });
    this.queue = work.catch(() => { this.persistenceError = 'Changes could not be saved on this device. Please retry.'; this.publish(); });
    return work;
  }
  async update(operation: (state: PrototypeState) => PrototypeState, owner = this.owner) {
    await this.transaction(raw => {
      if (owner !== this.owner) throw new Error('Account changed. Please try again.');
      return stageView(raw, owner, operation(collectionView(raw, owner)), this.id);
    });
  }
  async globals(operation: (state: PrototypeState) => PrototypeState) {
    await this.transaction(raw => ({ ...raw, ...operation({ ...raw, items: raw.items }), collectionSync: raw.collectionSync }));
  }
  async importGuest() {
    const owner = this.owner; if (!owner) throw new Error('Sign in to import guest cards.');
    await this.transaction(raw => { if (owner !== this.owner) throw new Error('Account changed.'); return importGuest(raw, owner, this.id); });
  }
  async declineImport() {
    const owner = this.owner; if (owner) await this.transaction(raw => withAccount(raw, owner, { ...accountOf(raw, owner), importDecision: 'declined' }));
  }
  async resolve(cardId: string, keepLocal: boolean) {
    const owner = this.owner; if (owner) await this.transaction(raw => withAccount(raw, owner, resolveConflict(accountOf(raw, owner), cardId, keepLocal, this.id)));
  }
  async sync() {
    const owner = this.owner;
    if (!owner || !this.cloud || this.syncing || !this.loaded) return;
    this.syncing = true; this.syncError = null; this.publish();
    try {
      const rows = await this.cloud.read(owner);
      await this.transaction(raw => withAccount(raw, owner, mergeRows(accountOf(raw, owner), rows)));
      for (let n = 0; n < 200 && this.owner === owner; n++) {
        const account = accountOf(this.raw, owner);
        const operation = account.pending.find(op => !op.after && !account.conflicts[op.cardId]);
        if (!operation) break;
        const result = await this.cloud.apply(owner, operation);
        await this.transaction(raw => withAccount(raw, owner, settle(accountOf(raw, owner), operation, result.status, result.row)));
      }
      if (this.owner === owner) {
        const latest = await this.cloud.read(owner);
        await this.transaction(raw => withAccount(raw, owner, { ...mergeRows(accountOf(raw, owner), latest), lastSynced: new Date().toISOString() }));
      }
    } catch { if (this.owner === owner) this.syncError = 'Could not sync. Your saved cards and pending changes remain on this device. Retry when connected.'; }
    finally { this.syncing = false; this.publish(); if (this.owner && this.owner !== owner) void this.sync(); }
  }
}
