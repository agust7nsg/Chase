import { supabase } from '../auth/client';
import { accountFetch } from '../auth/fetch';
import { CardSightRecognitionService } from './client';
import { isHostedScanner, liveScannerConfig } from './config';
import { CardSightError } from './types';
import type { RecognitionCatalog } from './resolve';
import type { RecognitionLinks } from './links';

export async function scannerCredentials(): Promise<{ token: string; apiKey: string }> {
  if (!isHostedScanner(liveScannerConfig) || !supabase) throw new CardSightError('CONFIGURATION', 'Online scanning is not configured.');
  const result = await supabase.auth.getSession();
  if (result.error || !result.data.session || result.data.session.user.is_anonymous) throw new CardSightError('CONFIGURATION', 'Sign in with a confirmed account to use the online scanner.');
  return { token: result.data.session.access_token, apiKey: liveScannerConfig.publishableKey };
}

export function createLiveRecognition(catalog: RecognitionCatalog, links: RecognitionLinks): CardSightRecognitionService {
  if (!liveScannerConfig) throw new CardSightError('CONFIGURATION', 'Connect the scanner before using CardSight.');
  return new CardSightRecognitionService({ proxyUrl: liveScannerConfig.proxyUrl, catalog, links,
    ...(isHostedScanner(liveScannerConfig) ? { credentials: scannerCredentials } : { token: liveScannerConfig.token }) });
}

export async function scannerHealth(signal: AbortSignal): Promise<{ ready: boolean; code?: string }> {
  if (!liveScannerConfig) return { ready: false, code: 'not_configured' };
  const hosted = isHostedScanner(liveScannerConfig);
  const credentials = hosted ? await scannerCredentials() : null;
  if (signal.aborted) throw new Error('Scanner connection cancelled.');
  const response = await accountFetch(globalThis.fetch, 7000)(`${liveScannerConfig.proxyUrl}/health`, {
    signal, headers: credentials ? { Authorization: `Bearer ${credentials.token}`, apikey: credentials.apiKey } : {},
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = value && typeof value === 'object' && 'error' in value ? value.error : null;
    return { ready: false, code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'unavailable' };
  }
  return { ready: Boolean(value && typeof value === 'object' && 'ready' in value && value.ready === true && 'mode' in value
    && value.mode === (hosted ? 'supabase-hosted' : 'local-development')) };
}
