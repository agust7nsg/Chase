import type { RecognitionOptions, RecognitionResult } from '../contracts';
import { resolveCardSightCandidates, type ChooseRecognitionCandidate, type RecognitionCatalog } from './resolve';
import { CardSightError, parseCardSightRecognitionResponse } from './types';
import type { RecognitionLinks } from './links';

interface ClientOptions {
  proxyUrl: string;
  /** Short-lived local development proxy credential, never a CardSight API key. */
  token: string;
  catalog: RecognitionCatalog;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  links?: RecognitionLinks;
}

const messages: Record<string, string> = {
  provider_contract_pending: 'Update and restart the local scanner server to enable CardSight.',
  provider_adapter_missing: 'The local scanner server needs its CardSight adapter configured.',
  not_configured: 'The development scanner proxy is not configured.',
  unauthorized: 'The scanner token is invalid. Check its configuration and reopen the scanner.',
  token_expired: 'The scanner token expired. Restart the proxy, update its token and reopen the scanner.',
  provider_response: 'The recognition service returned an unsupported response.',
  multiple_cards: 'Present one card at a time.',
  provider_rejected: 'CardSight could not read this photo. Present another card.',
  provider_auth: 'Check the CardSight key on the local server, then reopen the scanner.',
  provider_rate_limited: 'CardSight limit reached. Check provider usage before reopening the scanner.',
  run_limit: 'Local scan limit reached. Review usage, restart the server and reopen the scanner.',
};

/** Talks to Chase's own authenticated proxy; no provider API credential enters the mobile bundle. */
export class CardSightRecognitionService {
  private readonly endpoint: string;
  private busy = false;
  constructor(private readonly options: ClientOptions) {
    let url: URL;
    try { url = new URL(options.proxyUrl); } catch { throw new CardSightError('CONFIGURATION', 'Invalid development scanner URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || !options.token.trim() || options.token.length > 1024) throw new CardSightError('CONFIGURATION', 'Invalid development scanner configuration.');
    this.endpoint = `${options.proxyUrl.replace(/\/+$/, '')}/recognize`;
  }

  async recognize(options: RecognitionOptions & { chooseCandidate?: ChooseRecognitionCandidate } = {}): Promise<RecognitionResult> {
    if (options.signal?.aborted) throw new CardSightError('ABORTED', 'Recognition canceled.');
    if (this.busy) throw new CardSightError('BUSY', 'A recognition request is already running.');
    const image = options.image;
    if (!image || image.mimeType !== 'image/jpeg' || !image.base64 || image.base64.length > Math.ceil(2 * 1024 * 1024 / 3) * 4
      || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0) {
      throw new CardSightError('IMAGE_REQUIRED', 'A supported camera image is required for real recognition.');
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let removeAbort = () => {};
    let timedOut = false;
    this.busy = true;
    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        const aborted = () => { controller.abort(); reject(new CardSightError('ABORTED', 'Recognition canceled.')); };
        options.signal?.addEventListener('abort', aborted, { once: true });
        removeAbort = () => options.signal?.removeEventListener('abort', aborted);
        timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new CardSightError('TIMEOUT', 'Recognition timed out. Present another card.')); }, this.options.timeoutMs ?? 25000);
      });
      const requestId = `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
      const response = await Promise.race([(this.options.fetch ?? globalThis.fetch)(this.endpoint, {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.options.token}` },
        body: JSON.stringify({ requestId, image: { base64: image.base64, mimeType: image.mimeType } }),
      }), interrupted]);
      const text = await Promise.race([response.text(), interrupted]);
      if (text.length > 128 * 1024) throw new CardSightError('INVALID_RESPONSE', 'Recognition returned an unsupported response.');
      let value: unknown;
      try { value = JSON.parse(text); } catch { throw new CardSightError('INVALID_RESPONSE', 'Recognition returned an unsupported response.'); }
      if (!response.ok) {
        const code = value && typeof value === 'object' && 'error' in value && value.error && typeof value.error === 'object'
          && 'code' in value.error && typeof value.error.code === 'string' ? value.error.code : '';
        const configuration = response.status === 401 || ['provider_auth', 'not_configured', 'provider_adapter_missing', 'provider_contract_pending'].includes(code);
        const localThrottle = response.status === 429 && ['busy', 'rate_limited'].includes(code);
        throw new CardSightError(response.status === 429 ? 'RATE_LIMITED' : configuration ? 'CONFIGURATION' : 'PROVIDER_UNAVAILABLE',
          messages[code] ?? (localThrottle ? 'Scanner busy. Present another card shortly.' : response.status === 429 ? 'Recognition limit reached. Check usage before reopening the scanner.' : 'The recognition service is unavailable.'),
          localThrottle ? 'card-change' : undefined);
      }
      const result = parseCardSightRecognitionResponse(value);
      if (!result) throw new CardSightError('INVALID_RESPONSE', 'Recognition returned an unsupported response.');
      // Provider transport is complete; catalog timeout/cancellation and any
      // deliberate user review have their own lifecycle rather than a camera deadline.
      if (timer) clearTimeout(timer);
      removeAbort();
      return await resolveCardSightCandidates(result, this.options.catalog, { ...options, links: this.options.links });
    } catch (error) {
      if (options.signal?.aborted) throw new CardSightError('ABORTED', 'Recognition canceled.');
      if (timedOut) throw new CardSightError('TIMEOUT', 'Recognition timed out. Present another card.');
      if (error instanceof CardSightError) throw error;
      throw new CardSightError('NETWORK', 'Could not reach the scanner or catalog. Check the connection.');
    } finally {
      if (timer) clearTimeout(timer);
      removeAbort();
      this.busy = false;
    }
  }
}
