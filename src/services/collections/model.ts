import type { CollectionItem, PrototypeState } from '../../types/domain';
import { initialState, normalizeStoredState, FREE_COLLECTION_LIMIT } from '../domain';

export interface RemoteRow { cardId: string; revision: number; item: CollectionItem | null }
export interface CollectionOperation { id: string; cardId: string; baseRevision: number; after?: string; item: CollectionItem | null }
export interface AccountCollection {
  items: CollectionItem[]; remote: Record<string, RemoteRow>; pending: CollectionOperation[];
  conflicts: Record<string, RemoteRow>; importDecision: 'pending' | 'imported' | 'declined'; lastSynced: string | null;
}
export interface DeviceState extends PrototypeState { collectionSync?: { version: 1; accounts: Record<string, AccountCollection> } }
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
const cardKey = (value: unknown): value is string => typeof value === 'string' && /^[a-z\d][a-z\d:._-]{0,255}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function strictItems(value: unknown): CollectionItem[] {
  if (!Array.isArray(value) || value.length > 20000) throw new Error('Collection data needs recovery.');
  const items = normalizeStoredState({ items: value }).items;
  if (items.length !== value.length || items.some((item, index) => !cardKey(item.cardId) || item.quantity !== value[index].quantity || item.quantity > 1000000)) throw new Error('Collection data needs recovery.');
  return items;
}
export function parseRow(value: unknown): RemoteRow {
  if (!record(value) || !cardKey(value.cardId) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0) throw new Error('Invalid cloud collection response.');
  const item = value.item === null ? null : strictItems([value.item])[0];
  if (item && item.cardId !== value.cardId) throw new Error('Cloud printing identity does not match.');
  return { cardId: value.cardId, revision: value.revision as number, item };
}
export const emptyAccount = (): AccountCollection => ({ items: [], remote: {}, pending: [], conflicts: {}, importDecision: 'pending', lastSynced: null });
export function accountOf(state: DeviceState, owner: string): AccountCollection { return state.collectionSync?.accounts[owner] ?? emptyAccount(); }
export function withAccount(state: DeviceState, owner: string, account: AccountCollection): DeviceState {
  if (!uuid(owner)) throw new Error('Invalid collection owner.');
  return { ...state, collectionSync: { version: 1, accounts: { ...state.collectionSync?.accounts, [owner]: account } } };
}
export function collectionView(state: DeviceState, owner: string | null): PrototypeState {
  const { collectionSync: _sync, ...guest } = state;
  return owner ? { ...guest, items: accountOf(state, owner).items } : guest;
}
export function restoreDevice(value: unknown): DeviceState {
  const guest = normalizeStoredState(value);
  if (!record(value) || value.collectionSync === undefined) return guest;
  const sync = value.collectionSync;
  if (!record(sync) || sync.version !== 1 || !record(sync.accounts)) throw new Error('Saved account collections need recovery.');
  let restored: DeviceState = guest;
  for (const [owner, data] of Object.entries(sync.accounts)) {
    if (!uuid(owner) || !record(data) || !record(data.remote) || !Array.isArray(data.pending) || !record(data.conflicts)
      || !['pending', 'declined', 'imported'].includes(String(data.importDecision)) || !(data.lastSynced === null || typeof data.lastSynced === 'string')) throw new Error('Saved account collection needs recovery.');
    const remote: AccountCollection['remote'] = {}; const conflicts: AccountCollection['conflicts'] = {};
    for (const [id, row] of Object.entries(data.remote)) { const parsed = parseRow(row); if (id !== parsed.cardId) throw new Error('Invalid saved printing.'); remote[id] = parsed; }
    for (const [id, row] of Object.entries(data.conflicts)) { const parsed = parseRow(row); if (id !== parsed.cardId) throw new Error('Invalid saved conflict.'); conflicts[id] = parsed; }
    const pending: CollectionOperation[] = [];
    for (const raw of data.pending) {
      if (!record(raw) || !uuid(raw.id) || !cardKey(raw.cardId) || !Number.isSafeInteger(raw.baseRevision) || (raw.baseRevision as number) < 0
        || pending.some(op => op.id === raw.id) || (raw.after !== undefined && !pending.some(op => op.id === raw.after && op.cardId === raw.cardId))) throw new Error('Pending collection changes need recovery.');
      const item = parseRow({ cardId: raw.cardId, revision: raw.baseRevision, item: raw.item }).item;
      pending.push({ id: raw.id, cardId: raw.cardId, baseRevision: raw.baseRevision as number, ...(raw.after ? { after: raw.after as string } : {}), item });
    }
    const account = { items: strictItems(data.items), remote, pending, conflicts, importDecision: data.importDecision as AccountCollection['importDecision'], lastSynced: data.lastSynced as string | null };
    const canonical = (items: CollectionItem[]) => JSON.stringify([...items].sort((a, b) => a.cardId.localeCompare(b.cardId)));
    if (canonical(account.items) !== canonical(overlay(account).items)) throw new Error('Saved collection changes need recovery.');
    restored = withAccount(restored, owner, account);
  }
  return restored;
}
function overlay(account: AccountCollection): AccountCollection {
  const items = new Map(Object.values(account.remote).flatMap(row => row.item ? [[row.cardId, row.item] as const] : []));
  for (const op of account.pending) { if (op.item) items.set(op.cardId, op.item); else items.delete(op.cardId); }
  return { ...account, items: [...items.values()] };
}
export function stageView(state: DeviceState, owner: string | null, next: PrototypeState, id: () => string): DeviceState {
  const { items: _items, ...globals } = next;
  // Globals and scan-save receipts remain installation-wide; account inventory never enters guest rows.
  if (!owner) return { ...state, ...globals, items: next.items };
  const old = accountOf(state, owner); const pending = [...old.pending];
  const desired = new Map(next.items.map(item => [item.cardId, item])); const previous = new Map(old.items.map(item => [item.cardId, item]));
  for (const key of new Set([...desired.keys(), ...previous.keys()])) {
    const item = desired.get(key) ?? null;
    if (JSON.stringify(previous.get(key) ?? null) === JSON.stringify(item)) continue;
    const parent = pending.filter(op => op.cardId === key).at(-1);
    pending.push({ id: id(), cardId: key, item, baseRevision: old.remote[key]?.revision ?? 0, ...(parent ? { after: parent.id } : {}) });
  }
  return withAccount({ ...state, ...globals }, owner, { ...old, items: next.items, pending });
}
export function mergeRows(account: AccountCollection, rows: RemoteRow[]): AccountCollection {
  const remote = { ...account.remote };
  const conflicts = { ...account.conflicts };
  for (const row of rows) { if (!remote[row.cardId] || remote[row.cardId].revision <= row.revision) remote[row.cardId] = row;
    if (conflicts[row.cardId] && conflicts[row.cardId].revision < row.revision) conflicts[row.cardId] = row; }
  return overlay({ ...account, remote, conflicts });
}
export function settle(account: AccountCollection, operation: CollectionOperation, status: 'ok' | 'conflict', row: RemoteRow): AccountCollection {
  let next = mergeRows(account, [row]);
  if (status === 'conflict') return { ...next, conflicts: { ...next.conflicts, [operation.cardId]: row } };
  const pending = next.pending.filter(op => op.id !== operation.id).map(op => op.after === operation.id ? { ...op, after: undefined, baseRevision: row.revision } : op);
  const conflicts = { ...next.conflicts }; delete conflicts[operation.cardId];
  next = overlay({ ...next, pending, conflicts }); return next;
}
export function resolveConflict(account: AccountCollection, cardId: string, keepLocal: boolean, id: () => string): AccountCollection {
  const row = account.conflicts[cardId]; if (!row) return account;
  const item = account.items.find(item => item.cardId === cardId) ?? null;
  const conflicts = { ...account.conflicts }; delete conflicts[cardId];
  const pending = account.pending.filter(op => op.cardId !== cardId);
  if (keepLocal) pending.push({ id: id(), cardId, baseRevision: row.revision, item });
  return overlay({ ...account, conflicts, pending });
}
export function importGuest(state: DeviceState, owner: string, id: () => string): DeviceState {
  const account = accountOf(state, owner); if (account.importDecision === 'imported') return state;
  const items = new Map(account.items.map(item => [item.cardId, item]));
  for (const guest of state.items) { const old = items.get(guest.cardId); items.set(guest.cardId, old ? { ...old, quantity: old.quantity + guest.quantity } : { ...guest }); }
  const total = [...items.values()].reduce((sum, item) => sum + item.quantity, 0);
  if (state.plan === 'free' && total > FREE_COLLECTION_LIMIT) throw new Error(`Free collections hold up to ${FREE_COLLECTION_LIMIT} copies. Guest cards remain separate.`);
  const staged = stageView(state, owner, { ...collectionView(state, owner), items: strictItems([...items.values()]) }, id);
  return withAccount(staged, owner, { ...accountOf(staged, owner), importDecision: 'imported' });
}
export const emptyDevice = (): DeviceState => ({ ...initialState, trial: { ...initialState.trial }, items: [] });
