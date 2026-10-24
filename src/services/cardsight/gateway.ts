import { supabase } from '../auth/client';
import { accountFetch } from '../auth/fetch';
import { createScannerSession } from '../auth/scannerSession';
import { CardSightRecognitionService } from './client';
import { isHostedScanner, liveScannerConfig } from './config';
import { CardSightError } from './types';
import type { RecognitionCatalog } from './resolve';
import type { RecognitionLinks } from './links';
import { scannerProSimulation, scannerSimulationHeaders } from './simulation';

const session = supabase ? createScannerSession(supabase) : null;

export async function scannerCredentials(simulatePro = false): Promise<{ token: string; apiKey: string; simulatePro: boolean }> {
  if (!isHostedScanner(liveScannerConfig) || !session) throw new CardSightError('CONFIGURATION', 'Online scanning is not configured.');
  const current = await session();
  return { token: current.access_token, apiKey: liveScannerConfig.publishableKey,
    simulatePro: scannerProSimulation(typeof __DEV__ !== 'undefined' && __DEV__, simulatePro) };
}

export function createLiveRecognition(catalog: RecognitionCatalog, links: RecognitionLinks, simulatePro: () => boolean = () => false): CardSightRecognitionService {
  if (!liveScannerConfig) throw new CardSightError('CONFIGURATION', 'Connect the scanner before using CardSight.');
  return new CardSightRecognitionService({ proxyUrl: liveScannerConfig.proxyUrl, catalog, links,
    ...(isHostedScanner(liveScannerConfig) ? { credentials: () => scannerCredentials(simulatePro()) } : { token: liveScannerConfig.token }) });
}

export async function scannerHealth(signal: AbortSignal, simulatePro = false): Promise<{ ready: boolean; code?: string }> {
  if (!liveScannerConfig) return { ready: false, code: 'not_configured' };
  const hosted = isHostedScanner(liveScannerConfig);
  const credentials = hosted ? await scannerCredentials(simulatePro) : null;
  if (signal.aborted) throw new Error('Scanner connection cancelled.');
  const response = await accountFetch(globalThis.fetch, 7000)(`${liveScannerConfig.proxyUrl}/health`, {
    signal, headers: credentials ? { Authorization: `Bearer ${credentials.token}`, apikey: credentials.apiKey, ...scannerSimulationHeaders(credentials.simulatePro) } : {},
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = value && typeof value === 'object' && 'error' in value ? value.error : null;
    return { ready: false, code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'unavailable' };
  }
  if (credentials?.simulatePro && (!value || typeof value !== 'object' || !('proSimulation' in value) || value.proSimulation !== true)) {
    return { ready: false, code: 'pro_simulation_disabled' };
  }
  return { ready: Boolean(value && typeof value === 'object' && 'ready' in value && value.ready === true && 'mode' in value
    && value.mode === (hosted ? 'supabase-hosted' : 'local-development')) };
}
