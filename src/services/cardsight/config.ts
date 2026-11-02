import { resolveSupabaseConfig } from '../auth/config';

export interface DevelopmentScannerConfig { proxyUrl: string; token: string }
export interface HostedScannerConfig { mode: 'supabase-hosted'; proxyUrl: string; publishableKey: string }
export type LiveScannerConfig = DevelopmentScannerConfig | HostedScannerConfig;

export function hostedScannerConfig(url?: string, publishableKey?: string): HostedScannerConfig | null {
  const config = resolveSupabaseConfig(url, publishableKey);
  return config ? { mode: 'supabase-hosted', proxyUrl: `${config.url}/functions/v1/cardsight-scanner`, publishableKey: config.publishableKey } : null;
}
export const isHostedScanner = (config: LiveScannerConfig | null): config is HostedScannerConfig => Boolean(config && 'mode' in config && config.mode === 'supabase-hosted');

/** This prototype pairs with a private development server, not a production recognition gateway. */
export function developmentScannerConfig(development: boolean, endpoint?: string, token?: string): DevelopmentScannerConfig | null {
  if (!development || !endpoint?.trim() || !token?.trim()) return null;
  try {
    const url = new URL(endpoint.trim());
    const local = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname) || url.hostname.endsWith('.local');
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) return null;
    if (url.hostname === 'api.cardsight.ai') return null;
    return { proxyUrl: url.href.replace(/\/$/, ''), token: token.trim() };
  } catch { return null; }
}

export function resolveScannerConfig(options: { development: boolean; backend?: string; url?: string; publishableKey?: string; localUrl?: string; localToken?: string }): LiveScannerConfig | null {
  // An installed release must never target a workstation, even with obsolete pairing variables.
  if (options.backend === 'local' && options.development) return developmentScannerConfig(true, options.localUrl, options.localToken);
  if (options.backend && !['supabase', 'local'].includes(options.backend)) return null;
  return hostedScannerConfig(options.url, options.publishableKey);
}

// Only public deployment settings are bundled. Vendor and service-role keys stay server-only.
export const liveScannerConfig = resolveScannerConfig({
  development: typeof __DEV__ !== 'undefined' && __DEV__, backend: process.env.EXPO_PUBLIC_SCANNER_BACKEND,
  url: process.env.EXPO_PUBLIC_SUPABASE_URL, publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  localUrl: process.env.EXPO_PUBLIC_SCANNER_URL, localToken: process.env.EXPO_PUBLIC_SCANNER_TOKEN,
});
