import type { CardSightRecognitionResponse } from './cardsightProtocol.ts';

export type ScannerTransport = (jpeg: Uint8Array, context: {
  apiKey: string; fetch: typeof fetch; signal: AbortSignal;
}) => Promise<CardSightRecognitionResponse>;

type TransportErrorCode = 'provider_auth' | 'provider_rate_limited' | 'provider_rejected' | 'provider_unavailable' | 'provider_response' | 'multiple_cards';
/** Only a reviewed provider adapter may classify failures. Raw provider messages never leave this boundary. */
export class ScannerTransportError extends Error {
  constructor(readonly code: TransportErrorCode) { super(code); this.name = 'ScannerTransportError'; }
}
