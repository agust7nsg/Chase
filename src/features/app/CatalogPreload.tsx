import { useEffect } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { Image } from 'expo-image';
import { catalogService } from '@/services/catalog';
import { CatalogPreloader, preloadDelay, prefetchCatalogImages } from '@/services/catalogPreload';

const pendingImages = new Map<string, Promise<boolean>>();
function prefetchImage(url: string): Promise<boolean> {
  const existing = pendingImages.get(url);
  if (existing) return existing;
  const request = Image.prefetch(url, { cachePolicy: 'disk' });
  pendingImages.set(url, request);
  void request.finally(() => pendingImages.delete(url)).catch(() => {});
  return request;
}
const preloader = new CatalogPreloader(catalogService, (urls, signal) => prefetchCatalogImages(urls, signal,
  prefetchImage), preloadDelay);

export function CatalogPreload({ ready }: { ready: boolean }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!ready || /\/(scanner|organize|search|card|match-scan|auth)(\/|$)/.test(pathname)) return;
    let controller: AbortController | undefined;
    let running = false;
    const update = () => {
      if (AppState.currentState !== 'active') { controller?.abort(); return; }
      if (running) return;
      controller = new AbortController(); running = true;
      void preloader.run(controller.signal).finally(() => { running = false; });
    };
    // Start after initial render; never delay splash, auth or collection hydration.
    const initial = setTimeout(update, 1000);
    const retry = setInterval(update, 60000);
    const listener = AppState.addEventListener('change', update);
    return () => { clearTimeout(initial); clearInterval(retry); listener.remove(); controller?.abort(); };
  }, [ready, pathname]);
  return null;
}
