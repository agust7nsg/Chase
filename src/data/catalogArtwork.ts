import { catalogArtwork } from './catalog/artwork';
/** Resolve only the identical provider asset; keep the original public URL in persisted identities. */
export function bundledCatalogArtwork(source?: string): number | string | undefined {
  if (!source) return undefined;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.hostname !== 'assets.tcgdex.net') return undefined;
    const base = url.href.replace(/\/(?:high|low)\.(?:webp|png)$/i, '').replace(/\.(?:webp|png)$/i, '');
    return catalogArtwork[base];
  } catch { return undefined; }
}
