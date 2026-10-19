import type { Card } from '../../types/domain';
import type { RecognitionResult } from '../contracts';
import type { TcgDexCatalogService } from '../tcgdex';
import { CardSightError, type CardSightCandidate, type CardSightRecognitionResponse } from './types';

export type RecognitionCatalog = Pick<TcgDexCatalogService, 'listSets' | 'getSet' | 'getVariants'>;
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

function matches(candidate: CardSightCandidate, card: Card): boolean {
  return card.catalogIdentity?.provider === 'tcgdex' && (card.catalogIdentity.language === candidate.language || (candidate.language === 'und' && card.catalogIdentity.language === 'en'))
    && nameKey(candidate.name) === nameKey(card.name) && [candidate.setName, ...(candidate.setNames ?? [])].some(name => nameKey(name) === nameKey(card.setName))
    && sameNumber(candidate.collectorNumber, card.collectorNumber)
    && (!candidate.tcgdexId || candidate.tcgdexId === card.catalogIdentity.id);
}

function resultFor(candidate: CardSightCandidate, variants: Card[]): RecognitionResult | undefined {
  const exact = candidate.finish && candidate.finish !== 'unknown' ? variants.find(card => card.catalogIdentity?.variant === candidate.finish) : undefined;
  // An unavailable finish is never silently substituted with a different priced finish.
  if (candidate.finish && candidate.finish !== 'unknown' && !exact) return undefined;
  const card = exact ?? variants[0];
  if (!card) return undefined;
  const confident = candidate.confidenceTier ? candidate.confidenceTier === 'High' : candidate.confidence !== undefined && candidate.confidence >= 0.85;
  const review = !exact || !confident || candidate.language === 'und';
  return { ...card, ...(!exact ? { marketPrice: null, prices: [] } : {}),
    ...(candidate.confidence !== undefined ? { confidence: candidate.confidence } : {}),
    ...(candidate.confidenceTier !== undefined ? { confidenceTier: candidate.confidenceTier } : {}), ambiguity: review ? 'review' : 'confirmed' };
}

const evidence = (result: RecognitionResult) => result.confidenceTier === 'High' ? 3 : result.confidenceTier === 'Medium' ? 2
  : result.confidenceTier === 'Low' ? 1 : result.confidence ?? -1;

/** Resolve only exact English printing metadata. CardSight IDs never become collection/catalog IDs. */
export async function resolveCardSightCandidates(response: CardSightRecognitionResponse, catalog: RecognitionCatalog,
  options: { signal?: AbortSignal; chooseCandidate?: ChooseRecognitionCandidate } = {}): Promise<RecognitionResult> {
  canceled(options.signal);
  if (!response.candidates.length) throw new CardSightError('NO_MATCH', 'No card recognized. Adjust the card and retry.');
  const results = new Map<string, RecognitionResult>();
  const needsPrintingReview = new Set<string>();
  let sets: Awaited<ReturnType<RecognitionCatalog['listSets']>> | undefined;
  // Bounded by the normalized protocol's maximum 12 candidates. This resolves
  // the set index directly, avoiding the price-ranking crawl used for browsing.
  for (const candidate of response.candidates) {
    canceled(options.signal);
    if (candidate.language !== 'en' && candidate.language !== 'und') continue;
    let ids: string[] = [];
    if (candidate.tcgdexId) ids = [candidate.tcgdexId];
    else {
      sets ??= await catalogRequest(catalog.listSets(), options.signal);
      canceled(options.signal);
      for (const set of sets.filter(set => [candidate.setName, ...(candidate.setNames ?? [])].some(name => nameKey(set.name) === nameKey(name)))) {
        const details = await catalogRequest(catalog.getSet(set.id), options.signal);
        canceled(options.signal);
        ids.push(...(details?.cards.filter(card => nameKey(card.name) === nameKey(candidate.name)
          && numberKey(card.localId) === numberKey(candidate.collectorNumber).split('/')[0]).map(card => card.id) ?? []));
      }
    }
    for (const id of new Set(ids)) {
      const variants = (await catalogRequest(catalog.getVariants(id), options.signal)).filter(card => matches(candidate, card));
      canceled(options.signal);
      const result = resultFor(candidate, variants);
      if (!result) continue;
      const prior = results.get(result.id);
      if (!prior || evidence(result) > evidence(prior)) {
        results.set(result.id, result);
        if (candidate.language === 'und' || (candidate.confidenceTier !== undefined && candidate.confidenceTier !== 'High')
          || (candidate.confidence !== undefined && candidate.confidence < 0.85)) needsPrintingReview.add(result.id);
        else needsPrintingReview.delete(result.id);
      }
    }
  }
  canceled(options.signal);
  const choices = [...results.values()];
  if (!choices.length) throw new CardSightError('CATALOG_UNRESOLVED', 'The printing could not be matched to the English catalog. Retry or use manual search.');
  if (choices.length === 1 && !needsPrintingReview.has(choices[0].id)) return choices[0];
  if (!options.chooseCandidate) throw new CardSightError('AMBIGUOUS', 'Confirm the English printing before continuing.');
  const chosen = await catalogRequest(options.chooseCandidate(choices, options.signal), options.signal);
  canceled(options.signal);
  const result = choices.find(card => card.id === chosen.id);
  if (!result) throw new CardSightError('AMBIGUOUS', 'The selected printing is not one of the recognition matches.');
  const finishWasIdentified = response.candidates.some(candidate => matches(candidate, result)
    && candidate.finish !== undefined && candidate.finish !== 'unknown' && candidate.finish === result.catalogIdentity?.variant);
  return { ...result, ambiguity: finishWasIdentified ? 'confirmed' : 'review' };
}
