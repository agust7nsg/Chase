import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { addCard, canScan, getEntitlements, initialState, normalizeStoredState, recordSuccessfulScan, removeCard, setQuantity, summarizeCollection, recognitionService } from '@/services';
import type { Card, PrototypeState } from '@/types/domain';
import { FEATURED_CARD_IDS, type FeaturedCardId } from '@/services/featuredCards';
import { loadSessionFeaturedCard } from '@/features/home/featuredCardSession';

const STORAGE_KEY = 'chase.prototype.v1';
async function readStoredState() {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  const restored = stored ? normalizeStoredState(JSON.parse(stored)) : initialState;
  return __DEV__ ? restored : { ...restored, plan: 'free' as const };
}
type ActionResult = { ok: boolean; message: string };
type ChaseContextValue = {
  state: PrototypeState; ready: boolean; loadError: string | null; persistenceError: string | null;
  featuredCardId: FeaturedCardId;
  entitlements: ReturnType<typeof getEntitlements>; summary: ReturnType<typeof summarizeCollection>;
  retryLoad: () => void; completeOnboarding: () => void; setDevPro: (enabled: boolean) => void;
  recognize: (simulateFailure?: boolean, signal?: AbortSignal) => Promise<Card>;
  addToCollection: (cardId: string) => ActionResult; updateQuantity: (cardId: string, quantity: number) => ActionResult;
  removeFromCollection: (cardId: string) => void;
};
const ChaseContext = createContext<ChaseContextValue | null>(null);
export function ChaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PrototypeState>(initialState);
  const [featuredCardId, setFeaturedCardId] = useState<FeaturedCardId>(FEATURED_CARD_IDS[0]);
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const recognizing = useRef(false);
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
  const commit = useCallback((next: PrototypeState) => {
    stateRef.current = next; setState(next);
    saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))).then(() => {
      setPersistenceError(null);
    }).catch(() => {
      setPersistenceError('Changes are available for this session but could not be saved on this device.');
    });
  }, []);
  const perform = (operation: () => PrototypeState): ActionResult => {
    try { commit(operation()); return { ok: true, message: 'Collection updated.' }; }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Unable to update your collection.' }; }
  };
  const recognize = async (simulateFailure = false, signal?: AbortSignal) => {
    if (signal?.aborted) throw new Error('Sample scan canceled.');
    if (recognizing.current) throw new Error('A sample recognition is already in progress.');
    if (!canScan(stateRef.current)) throw new Error('Your complimentary scan has been used. Chase Pro is required for another scan.');
    recognizing.current = true;
    try {
      const card = await recognitionService.recognize({ simulateFailure });
      if (signal?.aborted) throw new Error('Sample scan canceled.');
      commit(recordSuccessfulScan(stateRef.current));
      return card;
    } finally { recognizing.current = false; }
  };
  return <ChaseContext.Provider value={{
    state, ready, loadError, persistenceError, featuredCardId, entitlements: getEntitlements(state.plan), summary: summarizeCollection(state.items),
    retryLoad: () => { setLoadError(null); void readStoredState().then(onLoaded).catch(onLoadFailed); }, completeOnboarding: () => commit({ ...stateRef.current, onboardingComplete: true }),
    setDevPro: (enabled) => { if (__DEV__) commit({ ...stateRef.current, plan: enabled ? 'pro' : 'free' }); },
    recognize, addToCollection: (cardId) => perform(() => addCard(stateRef.current, cardId)),
    updateQuantity: (cardId, quantity) => perform(() => setQuantity(stateRef.current, cardId, quantity)),
    removeFromCollection: (cardId) => commit(removeCard(stateRef.current, cardId)),
  }}>{children}</ChaseContext.Provider>;
}
export function useChase() {
  const value = useContext(ChaseContext);
  if (!value) throw new Error('useChase must be used inside ChaseProvider.');
  return value;
}
