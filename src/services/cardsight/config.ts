export interface DevelopmentScannerConfig { proxyUrl: string; token: string }

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

// Expo inlines these explicitly public, development-only pairing settings. The
// CardSight vendor key is deliberately never read anywhere under src/.
export const liveScannerConfig = developmentScannerConfig(typeof __DEV__ !== 'undefined' && __DEV__,
  process.env.EXPO_PUBLIC_SCANNER_URL, process.env.EXPO_PUBLIC_SCANNER_TOKEN);
