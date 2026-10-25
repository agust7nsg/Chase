import type { CatalogSet } from './types';

/** Alternate encodings of the SAME advertised printing, never another card. */
export function cardArtworkSources(source?: string): string[] {
  if (!source) return [];
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:') return [];
    // Repair a persisted URL from older clients which appended a size to an
    // already-complete asset filename.
    if (url.hostname === 'assets.tcgdex.net') url.pathname = url.pathname.replace(/(\.(?:webp|png|jpe?g))\/high\.webp$/i, '$1');
    const hasExtension = /\.(?:webp|png|jpe?g)$/i.test(url.pathname);
    if (url.hostname !== 'assets.tcgdex.net') return [url.href];
    const sized = /\/(?:high|low)\.(?:webp|png|jpe?g)$/i.test(url.pathname);
    if (hasExtension && !sized) return [url.href];
    const base = sized ? url.pathname.replace(/\/(?:high|low)\.(?:webp|png|jpe?g)$/i, '') : url.pathname.replace(/\/$/, '');
    const alternatives = ['high.webp', 'high.png', 'low.webp', 'low.png'].map(file => {
      const candidate = new URL(url); candidate.pathname = `${base}/${file}`; return candidate.href;
    });
    return [...new Set([...(hasExtension ? [url.href] : []), ...alternatives])];
  } catch { return []; }
}

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
