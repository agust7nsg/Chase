import type { PendingCatalogRecognition, ScanSession } from '../types/scanner';
import { parseCardSightRecognitionResponse, type CatalogResolutionDiagnostics, type CardSightRecognitionResponse } from './cardsight/types';

const stages = ['language', 'set', 'printing', 'finish', 'network'];
function diagnosticsFor(value: unknown): CatalogResolutionDiagnostics {
  if (!value || typeof value !== 'object' || !('stage' in value) || !stages.includes(String(value.stage))
    || !('inspectedSetIds' in value) || !Array.isArray(value.inspectedSetIds) || value.inspectedSetIds.length > 100
    || !value.inspectedSetIds.every(id => typeof id === 'string' && /^[a-zA-Z0-9._-]{1,200}$/.test(id))) throw new Error('Scan diagnostics need recovery.');
  return { stage: value.stage as CatalogResolutionDiagnostics['stage'], inspectedSetIds: [...value.inspectedSetIds] };
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
    return { id: row.id, recognition, diagnostics: diagnosticsFor(row.diagnostics), quantity: row.quantity, identifiedAt: row.identifiedAt };
  });
}

export const pendingRecognitionKey = (response: CardSightRecognitionResponse) => JSON.stringify(response.candidates.map(candidate =>
  [candidate.providerId, candidate.language, candidate.finish ?? 'unknown', Boolean(candidate.finishReviewRequired)]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

export function stagePendingRecognition(session: ScanSession, response: CardSightRecognitionResponse, diagnostics: CatalogResolutionDiagnostics,
  id: string, identifiedAt: string): ScanSession {
  const recognition = parseCardSightRecognitionResponse(response);
  if (!recognition?.candidates.length) throw new Error('No provider identification to keep.');
  const unresolved = session.unresolved ?? [];
  const existing = unresolved.find(row => pendingRecognitionKey(row.recognition) === pendingRecognitionKey(recognition));
  const next = existing ? unresolved.map(row => row.id === existing.id ? { ...row, quantity: row.quantity + 1, diagnostics: diagnosticsFor(diagnostics) } : row)
    : [...unresolved, { id, recognition, diagnostics: diagnosticsFor(diagnostics), identifiedAt, quantity: 1 }];
  const total = session.items.reduce((sum, item) => sum + item.quantity, 0) + next.reduce((sum, item) => sum + item.quantity, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Pending quantity is too large.');
  return { ...session, unresolved: next };
}

export function editPendingQuantity(session: ScanSession, id: string, quantity: number): ScanSession {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantity must be a positive whole number.');
  const next = { ...session, unresolved: (session.unresolved ?? []).map(row => row.id === id ? { ...row, quantity } : row) };
  const total = next.items.reduce((sum, item) => sum + item.quantity, 0) + next.unresolved.reduce((sum, item) => sum + item.quantity, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Pending quantity is too large.');
  return next;
}
