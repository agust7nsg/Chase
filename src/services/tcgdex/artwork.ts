import type { CatalogSet } from './types';

function formats(source?: string): string[] {
  if (!source) return [];
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:') return [];
    if (/\.(?:webp|png|jpe?g|svg)$/i.test(url.pathname)) return [url.href];
    const path = url.pathname.replace(/\/$/, '');
    return ['webp', 'png'].map(extension => { const candidate = new URL(url); candidate.pathname = `${path}.${extension}`; return candidate.href; });
  } catch { return []; }
}

/** Recent set assets sometimes have PNG only, even when an extensionless URL is advertised. */
export function setLogoSources(set: CatalogSet): string[] {
  return [...new Set([...formats(set.logo), ...formats(set.symbol)])];
}

export const usesAnniversaryBranding = (setId: string) => setId === '30th' || setId === '30th-c';
