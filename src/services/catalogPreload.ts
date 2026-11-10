import { cardArtworkSources } from './tcgdex/artwork';
import type { CatalogPage, CatalogQuery, CatalogSet } from './tcgdex/types';
export interface PreloadCatalog {
  syncInstalledCatalog?(signal: AbortSignal, beforeBatch: () => Promise<void>): Promise<void>;
  listSets(): Promise<CatalogSet[]>;
  queryCards(query: CatalogQuery): Promise<CatalogPage>;
}
/** One resumable pass in server release order. Foreground cancellation starts no new batch. */
export class CatalogPreloader {
  private completed = new Set<string>();
  private running = false;
  constructor(private catalog: PreloadCatalog, private images: (urls: string[], signal: AbortSignal) => Promise<void>, private wait: (signal: AbortSignal) => Promise<void>) {}
  async run(signal: AbortSignal) {
    if (this.running || signal.aborted) return;
    this.running = true;
    try {
      // listSets already requests releaseDate DESC, including briefs without dates.
      await this.catalog.syncInstalledCatalog?.(signal, () => this.wait(signal));
      const sets = await this.catalog.listSets();
      for (const set of sets) {
        if (signal.aborted) return;
        if (this.completed.has(set.id)) continue;
        await this.wait(signal);
        if (signal.aborted) return;
        let page = 1, more = true;
        while (more && !signal.aborted) {
          const result = await this.catalog.queryCards({ setId: set.id, page, pageSize: 100, signal, background: true, beforeBatch: () => this.wait(signal) });
          if (signal.aborted) return;
          // Price-ranked pages warm the very same URLs CardPrint displays.
          await this.images(result.cards.flatMap(card => card.imageUrl ? [card.imageUrl] : []), signal);
          if (result.stale) return; // Offline/failed refresh: back off instead of crawling the rest.
          more = result.hasMore; page++;
        }
        if (!signal.aborted) this.completed.add(set.id);
      }
    } catch { /* Background failures never replace foreground catalog results. Retry on a later pass. */ }
    finally { this.running = false; }
  }
}
export function preloadDelay(signal: AbortSignal, milliseconds = 750): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('Preload paused.'));
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('Preload paused.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Prefetch exact-printing fallbacks with a deadline and at most three native requests in flight. */
export async function prefetchCatalogImages(urls: string[], signal: AbortSignal, prefetch: (url: string) => Promise<boolean>, timeoutMs = 8000) {
  for (let start = 0; start < urls.length && !signal.aborted; start += 3) {
    await preloadDelay(signal, 100);
    const group = new AbortController();
    const cancel = () => group.abort(); signal.addEventListener('abort', cancel, { once: true });
    try {
      await Promise.all(urls.slice(start, start + 3).map(async url => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let abort: (() => void) | undefined;
        try {
          const work = async () => {
            for (const source of cardArtworkSources(url)) {
              if (signal.aborted || group.signal.aborted) throw new Error('Preload paused.');
              try { if (await prefetch(source)) return; } catch { /* Same printing's alternative encoding. */ }
            }
          };
          await Promise.race([work(), new Promise<never>((_, reject) => {
            abort = () => reject(new Error('Preload paused.'));
            group.signal.addEventListener('abort', abort, { once: true });
            timer = setTimeout(() => { group.abort(); reject(new Error('Image prefetch timed out.')); }, timeoutMs);
          })]);
        } finally { if (timer) clearTimeout(timer); if (abort) group.signal.removeEventListener('abort', abort); }
      }));
    } finally { group.abort(); signal.removeEventListener('abort', cancel); }
  }
}
