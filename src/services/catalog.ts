import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRegisteredCard, registerCatalogCard } from '../data/catalogRegistry';
import { getLegacyCard } from '../data/mocks/catalog';
import type { MarketPricingService } from './contracts';
import { TcgDexCatalogService } from './tcgdex';
import { installedCatalog } from './catalogPacks';
export { CatalogError } from './tcgdex';

/** Public catalog calls have no dependency on authentication or scanner simulation. */
export const catalogService = new TcgDexCatalogService({
  packs: process.env.EXPO_PUBLIC_CATALOG_MODE === 'api' ? undefined : installedCatalog,
  getSavedCard: getRegisteredCard,
  storage: AsyncStorage,
  maxSetCacheEntries: 1024,
  onCards: cards => { cards.forEach(registerCatalogCard); },
});

export const pricingService: MarketPricingService = {
  async getPrice(cardId) {
    // The explicitly simulated scanner retains its bundled demonstration identity.
    const legacy = getLegacyCard(cardId);
    if (legacy) return { ...legacy.marketPrice };
    const card = await catalogService.getCard(cardId);
    return card?.marketPrice ?? null;
  },
};
