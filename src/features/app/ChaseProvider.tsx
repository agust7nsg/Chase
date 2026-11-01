import { proSimulationEnabled } from '@/config/testing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { addCard, getEntitlements, initialState, removeCard, setQuantity, summarizeCollection } from '@/services';
import type { PrototypeState } from '@/types/domain';
import { FEATURED_CARD_IDS, type FeaturedCardId } from '@/services/featuredCards';
import { loadSessionFeaturedCard } from '@/features/home/featuredCardSession';
import { saveScanItems } from '@/services/scanSession';
import type { ScanSaveResult, ScanSessionItem } from '@/types/scanner';
import { catalogRevision, subscribeCatalog } from '@/data/catalogRegistry';
import { catalogService } from '@/services/catalog';
import { useAuth } from '@/features/account/AuthProvider';
import { supabase } from '@/services/auth/client';
import { CollectionSyncStore } from '@/services/collections/store';
import { SupabaseCollectionCloud } from '@/services/collections/supabase';
import { accountOf, collectionView, type AccountCollection } from '@/services/collections/model';

type ActionResult = { ok: boolean; message: string };
type ChaseContextValue = {
  state: PrototypeState; ready: boolean; loadError: string | null; persistenceError: string | null;
  featuredCardId: FeaturedCardId; catalogRevision: number;
  entitlements: ReturnType<typeof getEntitlements>; summary: ReturnType<typeof summarizeCollection>;
  retryLoad: () => void; completeOnboarding: () => Promise<void>; setDevPro: (enabled: boolean) => void;
  addToCollection: (cardId: string) => Promise<ActionResult>; updateQuantity: (cardId: string, quantity: number) => Promise<ActionResult>;
  removeFromCollection: (cardId: string) => Promise<ActionResult>;
  recordRecognition: (usedFree: boolean) => void;
  saveScannedItems: (items: ScanSessionItem[]) => Promise<ScanSaveResult>;
  collectionSync: { owner: string | null; syncing: boolean; error: string | null; account: AccountCollection | null; guestCopies: number };
  forgetDeletedAccount: (owner: string) => Promise<void>;
  syncCollection: () => void; importGuestCards: () => Promise<void>; keepGuestSeparate: () => Promise<void>;
  resolveCollectionConflict: (cardId: string, keepLocal: boolean) => Promise<void>;
};
const ChaseContext = createContext<ChaseContextValue | null>(null);
export function ChaseProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const revision = useSyncExternalStore(subscribeCatalog, catalogRevision, catalogRevision);
  const [, update] = useState(0); const mounted = useRef(true);
  const [store] = useState(() => new CollectionSyncStore(AsyncStorage, () => Crypto.randomUUID(), () => {}, supabase ? new SupabaseCollectionCloud(supabase) : null));
  const [featuredCardId, setFeaturedCardId] = useState<FeaturedCardId>(FEATURED_CARD_IDS[0]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const [, cardId] = await Promise.all([store.load(proSimulationEnabled), loadSessionFeaturedCard()]); if (mounted.current) { setFeaturedCardId(cardId); setLoadError(null); } }
    catch { if (mounted.current) setLoadError('Your local collection could not be loaded. Retry to protect your saved cards.'); }
  }, [store]);
  useEffect(() => {
    mounted.current = true; store.setPublisher(() => { if (mounted.current) update(n => n + 1); });
    void Promise.resolve().then(load);
    return () => { mounted.current = false; store.setPublisher(() => {}); store.select(null); };
  }, [load, store]);
  useEffect(() => { let active = true; if (auth.localReady) void Promise.resolve().then(() => { if (active) store.select(auth.localAccountId); }); return () => { active = false; }; }, [auth.localReady, auth.localAccountId, store]);
  const blockedOwner = useRef<string | null>(null);
  useEffect(() => {
    if (blockedOwner.current && blockedOwner.current !== auth.deletionJob?.ownerId) store.unblock(blockedOwner.current);
    blockedOwner.current = auth.deletionJob?.ownerId ?? null;
    if (blockedOwner.current) store.block(blockedOwner.current);
  }, [auth.deletionJob, store]);
  const ready = store.loaded && auth.localReady && auth.deletionReady;
  // Select the render view immediately, without tearing down the navigation stack
  // during OAuth callbacks or briefly exposing the previous account's inventory.
  const state = store.loaded ? collectionView(store.raw, auth.localAccountId) : initialState;
  const remoteIds = state.items.filter(item => item.cardId.startsWith('tcgdex:')).map(item => item.cardId).sort().join('|');
  useEffect(() => {
    if (!ready || !remoteIds) return; let active = true;
    void (async () => { const ids = remoteIds.split('|'); for (let start = 0; active && start < ids.length; start += 6) await Promise.allSettled(ids.slice(start, start + 6).map(id => catalogService.getCard(id))); })();
    return () => { active = false; };
  }, [ready, remoteIds]);
  const account = auth.localAccountId ? accountOf(store.raw, auth.localAccountId) : null;
  const selectedOwner = store.owner;
  const pendingCount = account?.pending.length ?? 0;
  useEffect(() => {
    if (!ready || !selectedOwner || selectedOwner !== auth.localAccountId) return;
    void store.sync();
    const interval = setInterval(() => { void store.sync(); }, 20000);
    const listener = AppState.addEventListener('change', status => { if (status === 'active') void store.sync(); });
    return () => { clearInterval(interval); listener.remove(); };
  }, [ready, auth.localAccountId, selectedOwner, store]);
  useEffect(() => {
    if (!ready || !selectedOwner || selectedOwner !== auth.localAccountId || !pendingCount) return;
    const timer = setTimeout(() => { void store.sync(); }, 300); return () => clearTimeout(timer);
  }, [ready, pendingCount, selectedOwner, auth.localAccountId, store]);
  const perform = async (operation: (state: PrototypeState) => PrototypeState): Promise<ActionResult> => {
    if (!ready || store.owner !== auth.localAccountId) return { ok: false, message: 'Your account collection is still loading.' };
    try { await store.update(operation, auth.localAccountId); return { ok: true, message: 'Collection updated.' }; }
    catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : 'Could not save your collection.' }; }
  };
  const saveScannedItems = async (items: ScanSessionItem[]): Promise<ScanSaveResult> => {
    if (!ready || store.owner !== auth.localAccountId) throw new Error('Your account collection is still loading.');
    let result!: ScanSaveResult;
    await store.update(current => { const saved = saveScanItems(current, items); result = saved.result; return saved.state; }, auth.localAccountId);
    return result;
  };
  return <ChaseContext.Provider value={{
    state, ready, loadError: loadError ?? (!auth.deletionReady ? auth.error : null), persistenceError: store.persistenceError, featuredCardId, catalogRevision: revision, entitlements: getEntitlements(state.plan), summary: summarizeCollection(state.items),
    retryLoad: () => { if (!auth.deletionReady) auth.retry(); void load(); }, completeOnboarding: () => store.globals(current => ({ ...current, onboardingComplete: true })),
    setDevPro: enabled => { if (proSimulationEnabled) void store.globals(current => ({ ...current, plan: enabled ? 'pro' : 'free' })).catch(() => {}); },
    addToCollection: id => perform(current => addCard(current, id)), updateQuantity: (id, quantity) => perform(current => setQuantity(current, id, quantity)),
    removeFromCollection: id => perform(current => removeCard(current, id)),
    recordRecognition: usedFree => { if (usedFree) void store.globals(current => ({ ...current, trial: { successfulRecognitions: 1 } })).catch(() => {}); },
    saveScannedItems,
    collectionSync: { owner: auth.localAccountId, syncing: store.syncing, error: store.syncError, account, guestCopies: store.raw.items.reduce((sum, item) => sum + item.quantity, 0) },
    forgetDeletedAccount: owner => store.forgetAccount(owner),
    syncCollection: () => { void store.sync(); }, importGuestCards: () => store.importGuest(), keepGuestSeparate: () => store.declineImport(),
    resolveCollectionConflict: (id, keep) => store.resolve(id, keep),
  }}>{children}</ChaseContext.Provider>;
}
export function useChase() { const value = useContext(ChaseContext); if (!value) throw new Error('useChase must be used inside ChaseProvider.'); return value; }
