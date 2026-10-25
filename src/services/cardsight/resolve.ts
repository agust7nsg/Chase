import type { Card } from '../../types/domain';
import type { RecognitionResult } from '../contracts';
import type { TcgDexCatalogService } from '../tcgdex';
import { CardSightError, CatalogResolutionError, type CatalogResolutionDiagnostics, type CardSightCandidate, type CardSightRecognitionResponse } from './types';
import type { RecognitionLinks } from './links';

export type RecognitionCatalog = Pick<TcgDexCatalogService, 'listSets' | 'getSet' | 'getVariants'>
  & Partial<Pick<TcgDexCatalogService, 'queryCards' | 'refreshRecognitionIndex'>>;
export type ChooseRecognitionCandidate = (cards: Card[], signal?: AbortSignal) => Promise<Card>;

const nameKey = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
function numberKey(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '').replace(/(^|\/)([A-Z]*)(0*)(\d+)/g, (_all, separator: string, prefix: string, _zeros: string, digits: string) => `${separator}${prefix}${Number(digits)}`);
}
function sameNumber(candidate: string, actual: string): boolean {
  const expected = numberKey(candidate); const received = numberKey(actual);
  // If the recognizer provides a printed denominator it must match as well.
  return expected.includes('/') ? expected === received : expected === received.split('/')[0];
}
const canceled = (signal?: AbortSignal) => { if (signal?.aborted) throw new CardSightError('ABORTED', 'Recognition canceled.'); };
async function catalogRequest<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  canceled(signal);
  if (!signal) return request;
  let listener: (() => void) | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_resolve, reject) => {
      listener = () => reject(new CardSightError('ABORTED', 'Recognition canceled.'));
      signal.addEventListener('abort', listener, { once: true });
      if (signal.aborted) listener();
    })]);
  } finally { if (listener) signal.removeEventListener('abort', listener); }
}

/** Optional local link persistence must never monopolize the scanner. */
async function optionalLink<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
  canceled(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await catalogRequest(Promise.race([Promise.resolve().then(() => { canceled(signal); return work(); }).catch(() => undefined),
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 250); })]), signal);
  } finally { if (timer) clearTimeout(timer); }
}

const setKey = (value: string) => nameKey(value).replace(/^pok[eé]mon(?:\s+tcg)?[ :–—-]*/, '').replace(/[–—]/g, '-').trim();
const setNames = (candidate: CardSightCandidate) => [candidate.setName, ...(candidate.setNames ?? [])];
function identityMatches(candidate: CardSightCandidate, card: Card): boolean {
  return card.catalogIdentity?.provider === 'tcgdex' && card.catalogIdentity.language === 'en'
    && (candidate.language === 'en' || candidate.language === 'und')
    && nameKey(candidate.name) === nameKey(card.name) && sameNumber(candidate.collectorNumber, card.collectorNumber)
    && (!candidate.tcgdexId || candidate.tcgdexId === card.catalogIdentity.id);
}

/** A unique catalog finish is usable only when no conflicting parallel evidence exists. */
export function recognitionForPrinting(candidate: CardSightCandidate, variants: Card[]): RecognitionResult | undefined {
  const requested = candidate.finish && candidate.finish !== 'unknown';
  const exact = requested ? variants.find(card => card.catalogIdentity?.variant === candidate.finish) : undefined;
  if (requested && !exact) return;
  const sole = !requested && !candidate.finishReviewRequired && variants.length === 1 && variants[0].variant !== 'Unspecified' ? variants[0] : undefined;
  const identified = candidate.finishReviewRequired ? undefined : exact ?? sole;
  const card = identified ?? exact ?? variants[0];
  if (!card) return;
  const confident = candidate.confidenceTier ? candidate.confidenceTier === 'High' : candidate.confidence !== undefined && candidate.confidence >= 0.85;
  return { ...card, ...(!identified ? { marketPrice: null, prices: [] } : {}),
    ...(candidate.confidence !== undefined ? { confidence: candidate.confidence } : {}),
    ...(candidate.confidenceTier ? { confidenceTier: candidate.confidenceTier } : {}),
    ambiguity: identified && confident && candidate.language === 'en' ? 'confirmed' : 'review' };
}

interface Resolved { result: RecognitionResult; candidate: CardSightCandidate; finishKnown: boolean; reviewPrinting: boolean; variants: Card[] }
const evidence = (result: RecognitionResult) => result.confidenceTier === 'High' ? 3 : result.confidenceTier === 'Medium' ? 2
  : result.confidenceTier === 'Low' ? 1 : result.confidence ?? -1;

/** Cross-provider names may differ; every fallback still verifies identity and requires user confirmation. */
export async function resolveCardSightCandidates(response: CardSightRecognitionResponse, catalog: RecognitionCatalog,
  options: { signal?: AbortSignal; chooseCandidate?: ChooseRecognitionCandidate; deferReview?: boolean; links?: RecognitionLinks; catalogTimeoutMs?: number } = {}): Promise<RecognitionResult> {
  canceled(options.signal);
  if (!response.candidates.length) throw new CardSightError('NO_MATCH', 'No card recognized. Present another card.');
  const results = new Map<string, Resolved>();
  const diagnostics: CatalogResolutionDiagnostics = { stage: 'language', inspectedSetIds: [] };
  const english = response.candidates.filter(candidate => candidate.language === 'en' || candidate.language === 'und');
  let sets: Awaited<ReturnType<RecognitionCatalog['listSets']>> | undefined;
  // A per-HTTP deadline does not bound a sequence of catalog/cache operations.
  // Cancel the complete automatic search, retain provider metadata for Organize,
  // and leave deliberate user review outside this deadline.
  const search = new AbortController();
  const abortSearch = () => search.abort();
  options.signal?.addEventListener('abort', abortSearch, { once: true });
  if (options.signal?.aborted) search.abort();
  let expired = false;
  const configuredBudget = options.catalogTimeoutMs;
  const budget = typeof configuredBudget === 'number' && Number.isFinite(configuredBudget) && configuredBudget > 0
    ? Math.min(30_000, configuredBudget) : 5000;
  const timer = setTimeout(() => { expired = true; search.abort(); }, budget);
  const request = <T,>(operation: Promise<T>) => catalogRequest(operation, search.signal);
  const add = async (candidate: CardSightCandidate, id: string, fallback: boolean, linked = false) => {
    const variants = (await request(catalog.getVariants(id))).filter(card => (linked
      ? card.catalogIdentity?.provider === 'tcgdex' && card.catalogIdentity.language === 'en' && card.catalogIdentity.id === id
      : identityMatches(candidate, card))
      && (linked || fallback || setNames(candidate).some(name => setKey(name) === setKey(card.setName))));
    canceled(search.signal);
    if (variants.length) diagnostics.stage = 'finish';
    const mapped = recognitionForPrinting(candidate, variants);
    const finishConflict = !mapped && variants.length > 0;
    const result: RecognitionResult | undefined = mapped ?? (options.deferReview && variants.length ? {
      ...variants[0], marketPrice: null, prices: [], ambiguity: 'review',
      ...(candidate.confidence !== undefined ? { confidence: candidate.confidence } : {}),
      ...(candidate.confidenceTier ? { confidenceTier: candidate.confidenceTier } : {}),
    } : undefined);
    if (!result) return;
    const prior = results.get(result.id);
    const finishKnown = !candidate.finishReviewRequired && (candidate.finish === result.catalogIdentity?.variant
      || ((!candidate.finish || candidate.finish === 'unknown') && variants.length === 1 && result.variant !== 'Unspecified'));
    const reviewPrinting = finishConflict || fallback || candidate.language === 'und'
      || (candidate.confidenceTier !== undefined && candidate.confidenceTier !== 'High')
      || (candidate.confidence !== undefined && candidate.confidence < 0.85);
    if (!prior || evidence(result) > evidence(prior.result)) results.set(result.id, { result, candidate, finishKnown, reviewPrinting, variants });
  };
  try {
    for (const candidate of english) {
      canceled(search.signal);
      diagnostics.stage = 'set';
      const linked = !candidate.tcgdexId && options.links ? await optionalLink(() => options.links!.lookup(candidate), search.signal) : undefined;
      if (candidate.tcgdexId || linked) { await add(candidate, candidate.tcgdexId ?? linked!, false, Boolean(linked)); continue; }
      sets ??= await request(catalog.listSets());
      const inspect = async () => {
        for (const set of sets!.filter(set => setNames(candidate).some(name => setKey(set.name) === setKey(name)))) {
          if (!diagnostics.inspectedSetIds.includes(set.id)) diagnostics.inspectedSetIds.push(set.id);
          const details = await request(catalog.getSet(set.id));
          diagnostics.stage = 'printing';
          for (const brief of details?.cards ?? []) if (nameKey(brief.name) === nameKey(candidate.name)
            && numberKey(brief.localId) === numberKey(candidate.collectorNumber).split('/')[0]) await add(candidate, brief.id, false);
        }
      };
      await inspect();
      if (!results.size && catalog.refreshRecognitionIndex) {
        sets = await request(catalog.refreshRecognitionIndex(diagnostics.inspectedSetIds));
        await inspect();
      }
    }
    // A bounded name+number search can find a new expansion under a different
    // provider label. Never silently choose a printing just because it is alone.
    if (!results.size && catalog.queryCards) for (const candidate of english.filter(row => !row.tcgdexId).slice(0, 3)) {
      const localNumber = candidate.collectorNumber.split('/')[0].trim();
      const padded = /^\d{1,2}$/.test(localNumber) ? localNumber.padStart(3, '0') : localNumber;
      for (const number of new Set([localNumber, padded])) {
        const page = await request(catalog.queryCards({ query: candidate.name,
          collectorNumber: number, page: 1, pageSize: 12, signal: search.signal }));
        for (const card of page.cards.filter(card => identityMatches(candidate, card)).slice(0, 12)) await add(candidate, card.catalogIdentity!.id, true);
        if (results.size) break;
      }
    }
  } catch (error) {
    canceled(options.signal);
    if (!expired && error instanceof CardSightError && error.code === 'ABORTED') throw error;
    throw new CatalogResolutionError(response, { ...diagnostics, stage: 'network' });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortSearch);
  }
  canceled(options.signal);
  const choices = [...results.values()];
  if (!choices.length) throw new CatalogResolutionError(response, diagnostics);
  if (choices.length === 1 && !choices[0].reviewPrinting) return choices[0].result;
  if (options.deferReview) {
    // These are preview/review snapshots only. No guess becomes a collectible
    // or contributes a price until Organize confirms its exact printing/finish.
    const snapshots = new Map<string, Card>();
    for (const choice of [...choices].sort((left, right) => evidence(right.result) - evidence(left.result))) {
      for (const card of [choice.result, ...choice.variants]) {
        if (!snapshots.has(card.id)) snapshots.set(card.id, { ...card, marketPrice: null, prices: [] });
      }
    }
    throw new CatalogResolutionError(response, { ...diagnostics, stage: 'printing' }, [...snapshots.values()]);
  }
  if (!options.chooseCandidate) throw new CardSightError('AMBIGUOUS', 'Confirm the English printing before continuing.');
  const chosen = await catalogRequest(options.chooseCandidate(choices.map(choice => choice.result), options.signal), options.signal);
  canceled(options.signal);
  const resolved = choices.find(choice => choice.result.id === chosen.id);
  if (!resolved) throw new CardSightError('AMBIGUOUS', 'The selected printing is not one of the recognition matches.');
  // Links only improve later matching. A cache write failure must not lose a
  // printing the user has already confirmed for this session.
  if (options.links) await optionalLink(() => options.links!.remember(resolved.candidate, resolved.result), options.signal);
  canceled(options.signal);
  return { ...resolved.result, ambiguity: resolved.finishKnown ? 'confirmed' : 'review' };
}
