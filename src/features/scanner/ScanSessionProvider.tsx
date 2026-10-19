import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { catalogService, canScan, pricingService, recognitionService } from '@/services';
import { getLegacyCard } from '@/data/mocks/catalog';
import { useChase } from '@/features/app/ChaseProvider';
import { appendRecognition, createScanSession, editSessionQuantity, editSessionVariant, sessionSummary, updateSessionPrice } from '@/services/scanSession';
import { ScanSessionStore } from '@/services/scanSessionStore';
import type { CardFrame } from '@/services/contracts';
import type { Card, MarketPrice } from '@/types/domain';
import type { ScanSession } from '@/types/scanner';
import { CardSightRecognitionService } from '@/services/cardsight/client';
import { liveScannerConfig } from '@/services/cardsight/config';

let sequence = 0;
const uniqueId = () => `scan-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
type DemoOptions = { fail: boolean; missingPrice: boolean; ambiguous: boolean };
export type IdentifyMode = { mode: 'live'; chooseCandidate?: (cards: Card[], signal?: AbortSignal) => Promise<Card> };
type SessionContext = {
  session: ScanSession; summary: ReturnType<typeof sessionSummary>; ready: boolean; loadError: string | null;
  error: string | null; busy: boolean; allowed: boolean; options: DemoOptions;
  setOptions: (options: DemoOptions) => void; retryLoad: () => void;
  identify: (frame: CardFrame, signal: AbortSignal, source?: IdentifyMode) => Promise<string>;
  quantity: (id: string, quantity: number) => Promise<void>; variant: (id: string, cardId: string) => Promise<void>;
  remove: (id: string) => Promise<void>; discard: () => Promise<void>; retryPrices: () => void;
  save: (ids: string[]) => Promise<{ saved: number; messages: string[] }>;
};
const Context = createContext<SessionContext | null>(null);
export function ScanSessionProvider({ children }: { children: ReactNode }) {
  const chase = useChase();
  const chaseRef = useRef(chase);
  useEffect(() => { chaseRef.current = chase; });
  const [session, setSession] = useState(() => createScanSession('loading'));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const identifying = useRef(false);
  const loading = useRef(false);
  const patchingPrices = useRef(new Set<string>());
  const [options, setOptions] = useState<DemoOptions>({ fail: false, missingPrice: false, ambiguous: false });
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);
  const [store] = useState(() => new ScanSessionStore(AsyncStorage, uniqueId, setSession));
  const prices = useRef(new Map<string, Promise<MarketPrice | null>>());
  const liveRecognition = useRef<CardSightRecognitionService | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const restored = await store.load();
      setLoadError(null);
      // A durable session marker closes the crash window before prototype trial persistence.
      if (restored.freeRecognitionUsed) chaseRef.current.recordRecognition(true);
      if (mounted.current) setReady(true);
    } catch { if (mounted.current) setLoadError('Pending scans could not be loaded. Retry without overwriting them.'); }
    finally { loading.current = false; }
  };
  useEffect(() => { if (chase.ready && !ready && !loadError) void Promise.resolve().then(load); });
  const resolvePrice = (cardId: string, missing = false) => {
    const key = `${cardId}:${missing}`;
    if (patchingPrices.current.has(key)) return;
    patchingPrices.current.add(key);
    let request = prices.current.get(key);
    if (!request) {
      request = new Promise<void>(resolve => setTimeout(resolve, 350)).then(() => missing ? null : pricingService.getPrice(cardId)).catch(() => null);
      prices.current.set(key, request);
    }
    void request.then(price => store.update(current => updateSessionPrice(current, cardId, price))).catch(() => { if (mounted.current) setError('Price update could not be stored. Retry prices in Organize.'); }).finally(() => patchingPrices.current.delete(key));
  };
  useEffect(() => {
    if (!ready) return;
    const receipts = new Set(chase.state.savedScanOperations ?? []);
    const saved = session.items.filter(item => receipts.has(item.operationId));
    if (saved.length && !busyRef.current) void store.update(current => ({ ...current, items: current.items.filter(item => !receipts.has(item.operationId)) })).catch(() => setError('Saved cards are protected from duplicate saves. Pending-list cleanup needs a retry.'));
    const needed = [...new Set(session.items.filter(item => item.priceState === 'loading' && !receipts.has(item.operationId)).map(item => item.cardId))];
    needed.forEach(id => resolvePrice(id, optionsRef.current.missingPrice));
    // Hydrated prices are refreshed independently of recognition. Price patches do not create rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session.items, chase.state.savedScanOperations, busy]);
  const mutate = async (transform: (session: ScanSession) => ScanSession) => {
    if (busyRef.current) throw new Error('Please wait for the current save.');
    setError(null);
    try { await store.update(current => {
      const receipts = new Set(chaseRef.current.state.savedScanOperations ?? []);
      return transform({ ...current, items: current.items.filter(item => !receipts.has(item.operationId)) });
    }); }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Pending changes could not be saved.'; setError(message); throw cause; }
  };
  const identify = async (frame: CardFrame, signal: AbortSignal, source?: IdentifyMode) => {
    if (identifying.current) throw new Error('Recognition is already in progress.');
    if (!ready || busyRef.current) throw new Error('Pending scans are not ready.');
    const current = chaseRef.current;
    if (!canScan(current.state) || (current.state.plan === 'free' && store.session.freeRecognitionUsed)) throw new Error('Your free scan has been used. Explore Chase Pro to continue.');
    identifying.current = true;
    try {
      if (source?.mode === 'live' && (!liveScannerConfig || !frame.image)) throw new Error('Connect the development scanner server before using CardSight.');
      if (source?.mode === 'live' && !liveRecognition.current) liveRecognition.current = new CardSightRecognitionService({ ...liveScannerConfig!, catalog: catalogService });
      const result = source?.mode === 'live'
        ? await liveRecognition.current!.recognize({ image: frame.image, signal, chooseCandidate: source.chooseCandidate })
        : await recognitionService.recognize({ cardId: frame.cardId, simulateFailure: optionsRef.current.fail, signal });
      const card = result.catalogIdentity ? await catalogService.getCard(result.id) : getLegacyCard(result.id);
      if (signal.aborted) throw new Error('Recognition canceled.');
      if (!card) throw new Error('Printing not found. Try again.');
      // Recheck after the asynchronous adapter; development access may have changed.
      if (!canScan(chaseRef.current.state) || (chaseRef.current.state.plan === 'free' && store.session.freeRecognitionUsed)) throw new Error('Your free scan has been used.');
      const isFree = chaseRef.current.state.plan === 'free';
      await store.update(value => {
        if (signal.aborted) throw new Error('Recognition canceled.');
        const receipts = new Set(chaseRef.current.state.savedScanOperations ?? []);
        const pending = { ...value, items: value.items.filter(item => !receipts.has(item.operationId)) };
        return appendRecognition(pending, card, uniqueId(), new Date().toISOString(), isFree, source?.mode !== 'live' && optionsRef.current.ambiguous ? 'review' : result.ambiguity ?? 'confirmed', result.confidence);
      });
      chaseRef.current.recordRecognition(isFree);
      if (result.ambiguity !== 'review' && !(source?.mode !== 'live' && optionsRef.current.ambiguous)) resolvePrice(card.id, source?.mode === 'live' ? false : optionsRef.current.missingPrice);
      return card.id;
    } finally { identifying.current = false; }
  };
  const save = async (ids: string[]) => {
    if (busyRef.current || identifying.current) throw new Error('Please wait for recognition or saving to finish.');
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const items = store.session.items.filter(item => ids.includes(item.id));
      const result = await chaseRef.current.saveScannedItems(items);
      const acknowledged = new Set(result.savedOperationIds);
      const count = items.filter(item => acknowledged.has(item.operationId)).reduce((sum, item) => sum + item.quantity, 0);
      try { await store.update(value => ({ ...value, items: value.items.filter(item => !acknowledged.has(item.operationId)) })); }
      catch { throw new Error('Collection saved. Pending-list cleanup failed; retry is safe and will not add duplicates.'); }
      return { saved: count, messages: result.errors.map(row => row.message) };
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Save failed. Pending cards have been kept.'); throw cause; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const savedOperations = new Set(chase.state.savedScanOperations ?? []);
  const pending = { ...session, items: session.items.filter(item => !savedOperations.has(item.operationId)) };
  return <Context.Provider value={{ session: pending, summary: sessionSummary(pending), ready, loadError, error, busy,
    allowed: canScan(chase.state) && !(chase.state.plan === 'free' && session.freeRecognitionUsed), options, setOptions, retryLoad: () => { void load(); }, identify,
    quantity: (id, value) => mutate(current => editSessionQuantity(current, id, value, uniqueId())),
    variant: async (id, cardId) => { await mutate(current => editSessionVariant(current, id, cardId, uniqueId())); resolvePrice(cardId, optionsRef.current.missingPrice); },
    remove: id => mutate(current => ({ ...current, items: current.items.filter(item => item.id !== id) })),
    discard: () => mutate(current => ({ ...current, items: [] })),
    retryPrices: () => { prices.current.clear(); [...new Set(store.session.items.filter(item => item.ambiguity === 'confirmed').map(item => item.cardId))].forEach(id => resolvePrice(id, false)); }, save,
  }}>{children}</Context.Provider>;
}
export function useScanSession() { const context = useContext(Context); if (!context) throw new Error('ScanSessionProvider is missing.'); return context; }
