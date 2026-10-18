import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { addCard, getEntitlements, initialState, normalizeStoredState, removeCard, setQuantity, summarizeCollection } from '@/services';
import type { PrototypeState } from '@/types/domain';
import { FEATURED_CARD_IDS, type FeaturedCardId } from '@/services/featuredCards';
import { loadSessionFeaturedCard } from '@/features/home/featuredCardSession';
import { saveScanItems } from '@/services/scanSession';
import type { ScanSaveResult, ScanSessionItem } from '@/types/scanner';
import { catalogRevision, subscribeCatalog } from '@/data/catalogRegistry';
import { catalogService } from '@/services/catalog';

const STORAGE_KEY = 'chase.prototype.v1';
async function readStoredState() {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  const restored = stored ? normalizeStoredState(JSON.parse(stored)) : initialState;
  return __DEV__ ? restored : { ...restored, plan: 'free' as const };
}
type ActionResult = { ok: boolean; message: string };
type ChaseContextValue = {
  state: PrototypeState; ready: boolean; loadError: string | null; persistenceError: string | null;
  featuredCardId: FeaturedCardId; catalogRevision: number;
  entitlements: ReturnType<typeof getEntitlements>; summary: ReturnType<typeof summarizeCollection>;
  retryLoad: () => void; completeOnboarding: () => void; setDevPro: (enabled: boolean) => void;
  addToCollection: (cardId: string) => ActionResult; updateQuantity: (cardId: string, quantity: number) => ActionResult;
  removeFromCollection: (cardId: string) => void;
  recordRecognition: (usedFree: boolean) => void;
  saveScannedItems: (items: ScanSessionItem[]) => Promise<ScanSaveResult>;
};
const ChaseContext = createContext<ChaseContextValue | null>(null);
export function ChaseProvider({ children }: { children: ReactNode }) {
  const revision = useSyncExternalStore(subscribeCatalog, catalogRevision, catalogRevision);
  const [state, setState] = useState<PrototypeState>(initialState);
  const [featuredCardId, setFeaturedCardId] = useState<FeaturedCardId>(FEATURED_CARD_IDS[0]);
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const savingScans = useRef(false);
  const onLoaded = useCallback((next: PrototypeState) => {
    stateRef.current = next; setState(next); setReady(true); setLoadError(null);
  }, []);
  const onLoadFailed = useCallback(() => {
    setLoadError('Your local collection could not be loaded. Retry to protect your saved cards.');
  }, []);
  useEffect(() => {
    void Promise.all([readStoredState(), loadSessionFeaturedCard()]).then(([next, cardId]) => {
      setFeaturedCardId(cardId);
      onLoaded(next);
    }).catch(onLoadFailed);
  }, [onLoaded, onLoadFailed]);
  const remoteIds = state.items.filter(item => item.cardId.startsWith('tcgdex:')).map(item => item.cardId).sort().join('|');
  useEffect(() => {
    if (!ready || !remoteIds) return;
    let active = true;
    // Refresh references without changing ownership, quantities, or legacy records.
    const ids = remoteIds.split('|');
    void (async () => {
      for (let start = 0; active && start < ids.length; start += 6) {
        await Promise.allSettled(ids.slice(start, start + 6).map(id => catalogService.getCard(id)));
      }
    })();
    return () => { active = false; };
  }, [ready, remoteIds]);
  const commit = useCallback((next: PrototypeState) => {
    stateRef.current = next; setState(next);
    saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))).then(() => {
      setPersistenceError(null);
    }).catch(() => {
      setPersistenceError('Changes are available for this session but could not be saved on this device.');
    });
  }, []);
  const perform = (operation: () => PrototypeState): ActionResult => {
    if (savingScans.current) return { ok: false, message: 'Please wait while your scanned cards are saved.' };
    try { commit(operation()); return { ok: true, message: 'Collection updated.' }; }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Unable to update your collection.' }; }
  };
  const saveScannedItems = useCallback(async (items: ScanSessionItem[]): Promise<ScanSaveResult> => {
    if (savingScans.current) throw new Error('A save is already in progress.');
    savingScans.current = true;
    const operation = saveQueue.current.then(async () => {
      const saved = saveScanItems(stateRef.current, items);
      // Do not acknowledge success or remove pending rows until collection + receipts are durable.
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saved.state));
      stateRef.current = saved.state; setState(saved.state); setPersistenceError(null);
      return saved.result;
    });
    saveQueue.current = operation.then(() => undefined, () => { setPersistenceError('Scanned cards could not be saved. They remain in Organize.'); });
    try { return await operation; } finally { savingScans.current = false; }
  }, []);
  const afterScanSave = (action: () => void) => {
    if (savingScans.current) void saveQueue.current.then(action);
    else action();
  };
  return <ChaseContext.Provider value={{
    state, ready, loadError, persistenceError, featuredCardId, catalogRevision: revision, entitlements: getEntitlements(state.plan), summary: summarizeCollection(state.items),
    retryLoad: () => { setLoadError(null); void readStoredState().then(onLoaded).catch(onLoadFailed); }, completeOnboarding: () => afterScanSave(() => commit({ ...stateRef.current, onboardingComplete: true })),
    setDevPro: (enabled) => { if (__DEV__) afterScanSave(() => commit({ ...stateRef.current, plan: enabled ? 'pro' : 'free' })); },
    addToCollection: (cardId) => perform(() => addCard(stateRef.current, cardId)),
    updateQuantity: (cardId, quantity) => perform(() => setQuantity(stateRef.current, cardId, quantity)),
    removeFromCollection: (cardId) => afterScanSave(() => commit(removeCard(stateRef.current, cardId))),
    recordRecognition: (usedFree) => { if (usedFree && stateRef.current.trial.successfulRecognitions === 0) commit({ ...stateRef.current, trial: { successfulRecognitions: 1 } }); },
    saveScannedItems,
  }}>{children}</ChaseContext.Provider>;
}
export function useChase() {
  const value = useContext(ChaseContext);
  if (!value) throw new Error('useChase must be used inside ChaseProvider.');
  return value;
}
