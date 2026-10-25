import type { PendingCatalogRecognition, ScanSession } from '../types/scanner';
import { parseCardSightRecognitionResponse, type CatalogResolutionDiagnostics, type CardSightRecognitionResponse } from './cardsight/types';
import { validateCatalogSnapshot } from '../data/catalogRegistry';
import type { Card } from '../types/domain';

const stages = ['language', 'set', 'printing', 'finish', 'network'];
function diagnosticsFor(value: unknown): CatalogResolutionDiagnostics {
  if (!value || typeof value !== 'object' || !('stage' in value) || !stages.includes(String(value.stage))
    || !('inspectedSetIds' in value) || !Array.isArray(value.inspectedSetIds) || value.inspectedSetIds.length > 100
    || !value.inspectedSetIds.every(id => typeof id === 'string' && /^[a-zA-Z0-9._-]{1,200}$/.test(id))) throw new Error('Scan diagnostics need recovery.');
  return { stage: value.stage as CatalogResolutionDiagnostics['stage'], inspectedSetIds: [...value.inspectedSetIds] };
}

/** Strict identity whitelist; pending options carry artwork but never an unconfirmed valuation. */
function reviewChoicesFor(value: unknown): Card[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('Printing review choices need recovery.');
  const ids = new Set<string>();
  return value.map(card => {
    const parsed = validateCatalogSnapshot(card, card?.id);
    if (!parsed || parsed.catalogIdentity?.language !== 'en' || ids.has(parsed.id)) throw new Error('Printing review choices need recovery.');
    ids.add(parsed.id);
    return { ...parsed, marketPrice: null, prices: [] };
  });
}

/** Whitelist on restore; camera bytes and arbitrary provider fields cannot enter durable staging. */
export function restorePendingRecognitions(value: unknown): PendingCatalogRecognition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Pending identifications need recovery.');
  const ids = new Set<string>();
  return value.map(row => {
    const recognition = parseCardSightRecognitionResponse(row?.recognition);
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || ids.has(row.id)
      || !recognition?.candidates.length || !Number.isSafeInteger(row.quantity) || row.quantity < 1
      || typeof row.identifiedAt !== 'string' || !Number.isFinite(Date.parse(row.identifiedAt))) throw new Error('Pending identifications need recovery.');
    ids.add(row.id);
    const reviewChoices = reviewChoicesFor(row.reviewChoices);
    if (row.freeRecognitionRecorded !== undefined && typeof row.freeRecognitionRecorded !== 'boolean') throw new Error('Pending trial confirmation needs recovery.');
    if (row.freeRecognitionRecorded && !reviewChoices) throw new Error('Pending trial confirmation needs recovery.');
    return { id: row.id, recognition, diagnostics: diagnosticsFor(row.diagnostics), quantity: row.quantity, identifiedAt: row.identifiedAt,
      ...(reviewChoices ? { reviewChoices } : {}), ...(row.freeRecognitionRecorded ? { freeRecognitionRecorded: true } : {}) };
  });
}

export const pendingRecognitionKey = (response: CardSightRecognitionResponse) => JSON.stringify(response.candidates.map(candidate =>
  [candidate.providerId, candidate.language, candidate.finish ?? 'unknown', Boolean(candidate.finishReviewRequired)]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

export function stagePendingRecognition(session: ScanSession, response: CardSightRecognitionResponse, diagnostics: CatalogResolutionDiagnostics,
  id: string, identifiedAt: string, choices?: Card[], isFree = false): ScanSession {
  const recognition = parseCardSightRecognitionResponse(response);
  if (!recognition?.candidates.length) throw new Error('No provider identification to keep.');
  const reviewChoices = reviewChoicesFor(choices);
  const recordFree = Boolean(isFree && reviewChoices);
  if (recordFree && session.freeRecognitionUsed) throw new Error('Your free scan has been used.');
  const unresolved = session.unresolved ?? [];
  const existing = unresolved.find(row => pendingRecognitionKey(row.recognition) === pendingRecognitionKey(recognition));
  const review = reviewChoices ? { reviewChoices } : {};
  const trial = recordFree ? { freeRecognitionRecorded: true } : {};
  const next = existing ? unresolved.map(row => row.id === existing.id ? { ...row, quantity: row.quantity + 1, diagnostics: diagnosticsFor(diagnostics), ...review, ...trial } : row)
    : [...unresolved, { id, recognition, diagnostics: diagnosticsFor(diagnostics), identifiedAt, quantity: 1, ...review, ...trial }];
  const total = session.items.reduce((sum, item) => sum + item.quantity, 0) + next.reduce((sum, item) => sum + item.quantity, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Pending quantity is too large.');
  return { ...session, unresolved: next, freeRecognitionUsed: session.freeRecognitionUsed || recordFree };
}

/** Ambiguous appearance verification reclassifies one existing UNSAVED copy, never counts another card. */
export function deferHeldRecognition(session: ScanSession, heldCardId: string, response: CardSightRecognitionResponse,
  diagnostics: CatalogResolutionDiagnostics, id: string, identifiedAt: string, choices: Card[], operationId: string): ScanSession {
  const held = session.items.find(item => item.cardId === heldCardId);
  if (!held) return session;
  const items = held.quantity === 1 ? session.items.filter(item => item.id !== held.id)
    : session.items.map(item => item.id === held.id ? { ...item, quantity: item.quantity - 1, operationId } : item);
  let next = stagePendingRecognition({ ...session, items }, response, diagnostics, id, identifiedAt, choices);
  const key = pendingRecognitionKey(response);
  if (session.freeRecognitionUsed) next = { ...next, unresolved: next.unresolved?.map(row => pendingRecognitionKey(row.recognition) === key
    ? { ...row, freeRecognitionRecorded: true } : row) };
  return next;
}

export function editPendingQuantity(session: ScanSession, id: string, quantity: number): ScanSession {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantity must be a positive whole number.');
  const next = { ...session, unresolved: (session.unresolved ?? []).map(row => row.id === id ? { ...row, quantity } : row) };
  const total = next.items.reduce((sum, item) => sum + item.quantity, 0) + next.unresolved.reduce((sum, item) => sum + item.quantity, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Pending quantity is too large.');
  return next;
}
