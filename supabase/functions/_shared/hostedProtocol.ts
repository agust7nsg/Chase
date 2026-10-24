import type { CardSightRecognitionResponse } from './cardsightProtocol.ts';

export interface ScannerOutcome { status: number; body: Record<string, unknown> }
export const failure = (status: number, code: string): ScannerOutcome => ({ status, body: { error: { code } } });
export class ScannerDeadlineError extends Error {}
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 1024;
export const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const isUserId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export interface HostedScannerStore {
  status(userId: string, simulatePro?: boolean): Promise<ScannerOutcome>;
  claim(userId: string, requestId: string, digest: string, simulatePro?: boolean): Promise<{ lease: string } | ScannerOutcome>;
  complete(userId: string, requestId: string, lease: string, outcome: ScannerOutcome): Promise<void>;
}
export interface HostedScannerOptions {
  authenticate: (token: string) => Promise<string | null>;
  store: HostedScannerStore;
  recognize: (bytes: Uint8Array, signal: AbortSignal) => Promise<CardSightRecognitionResponse>;
  configured: boolean;
  allowedOrigins?: readonly string[];
  providerTimeoutMs?: number;
  inputTimeoutMs?: number;
}

/** Races even transports that ignore AbortSignal; no automatic provider retries. */
export async function deadline<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number, caller?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined; let interrupt: () => void = () => {};
  const failed = new Promise<never>((_resolve, reject) => {
    interrupt = () => { controller.abort(); reject(new ScannerDeadlineError('Scanner request interrupted.')); };
    caller?.addEventListener('abort', interrupt, { once: true });
    timer = setTimeout(interrupt, timeoutMs);
  });
  try {
    if (caller?.aborted) throw new Error('Scanner request interrupted.');
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)), failed]);
  } finally { if (timer) clearTimeout(timer); caller?.removeEventListener('abort', interrupt); }
}

export async function boundedJson(body: ReadableStream<Uint8Array> | null, maximum: number, signal?: AbortSignal): Promise<unknown> {
  if (!body) throw new Error('Missing scanner body.');
  const reader = body.getReader(); let length = 0; const chunks: Uint8Array[] = [];
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new Error('Scanner body interrupted.');
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > maximum) throw new RangeError('Scanner body too large.');
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { signal?.removeEventListener('abort', abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function scannerImage(value: unknown): { id: string; bytes: Uint8Array } | null {
  if (!isRecord(value) || Object.keys(value).some(key => !['requestId', 'image'].includes(key))
    || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,96}$/.test(value.requestId) || !isRecord(value.image)) return null;
  const image = value.image;
  if (Object.keys(image).some(key => !['base64', 'mimeType', 'width', 'height'].includes(key)) || image.mimeType !== 'image/jpeg'
    || typeof image.base64 !== 'string' || image.base64.length === 0 || image.base64.length % 4 !== 0
    || image.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)) return null;
  for (const dimension of ['width', 'height']) if (image[dimension] !== undefined && (!Number.isSafeInteger(image[dimension]) || Number(image[dimension]) < 1 || Number(image[dimension]) > 8192)) return null;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(image.base64), character => character.charCodeAt(0)); } catch { return null; }
  return bytes.length >= 4 && bytes.length <= MAX_IMAGE_BYTES && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    ? { id: value.requestId, bytes } : null;
}
