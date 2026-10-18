import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerCatalogCard } from '../data/catalogRegistry';
import { getLegacyCard } from '../data/mocks/catalog';
import type { MarketPricingService } from './contracts';
import { TcgDexCatalogService } from './tcgdex';
export { CatalogError } from './tcgdex';

/** Public catalog calls have no dependency on authentication or scanner simulation. */
export const catalogService = new TcgDexCatalogService({
  storage: AsyncStorage,
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
