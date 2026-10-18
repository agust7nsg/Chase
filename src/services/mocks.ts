import { catalog, getLegacyCard, type LegacyCard } from '../data/mocks/catalog';
import type { Collection, MarketPrice, Plan, SubscriptionEntitlement } from '../types/domain';
import type {
  CardCatalogService,
  CardRecognitionService,
  CollectionRepository,
  MarketPricingService,
  RecognitionOptions,
  RecognitionResult,
  SubscriptionService,
} from './contracts';
import { DomainError, getEntitlements } from './domain';

function copyCard(card: LegacyCard): LegacyCard {
  return { ...card, marketPrice: { ...card.marketPrice } };
}

export class MockCardCatalogService implements CardCatalogService {
  async listCards(): Promise<LegacyCard[]> {
    return catalog.map(copyCard);
  }

  async getCard(cardId: string): Promise<LegacyCard | undefined> {
    const card = getLegacyCard(cardId);
    return card ? copyCard(card) : undefined;
  }

  async searchCards(query: string): Promise<LegacyCard[]> {
    const search = query.trim().toLocaleLowerCase();
    return catalog
      .filter((card) => [card.name, card.setName, card.collectorNumber, card.variant]
        .some((field) => field.toLocaleLowerCase().includes(search)))
      .map(copyCard);
  }
}

/** Simulates recognition, with no camera, network request, or quota mutation. */
export class MockCardRecognitionService implements CardRecognitionService {
  private nextCardIndex = 0;

  constructor(private readonly delayMs = 900) {}

  async recognize(options: RecognitionOptions = {}): Promise<RecognitionResult> {
    if (options.signal?.aborted) throw new Error('Recognition canceled.');
    if (this.delayMs > 0) await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new Error('Recognition canceled.')); };
      const timer = setTimeout(() => { options.signal?.removeEventListener('abort', cancel); resolve(); }, this.delayMs);
      options.signal?.addEventListener('abort', cancel, { once: true });
    });
    if (options.signal?.aborted) throw new Error('Recognition canceled.');
    if (options.simulateFailure) {
      throw new Error('No card recognized. Try centering the card in the frame.');
    }
    const card = options.cardId ? getLegacyCard(options.cardId) : catalog[this.nextCardIndex % catalog.length];
    if (!card) throw new Error('This printing is not in the catalog.');
    this.nextCardIndex += 1;
    return copyCard(card);
  }
}

export class MockMarketPricingService implements MarketPricingService {
  async getPrice(cardId: string): Promise<MarketPrice> {
    const card = getLegacyCard(cardId);
    if (!card) throw new DomainError('UNKNOWN_CARD', 'This card is not in the catalog.');
    return { ...card.marketPrice };
  }
}

function copyCollection(collection: Collection): Collection {
  return { ...collection, items: collection.items.map((item) => ({ ...item })) };
}

/** In-memory adapter. The application persists prototype state separately. */
export class MockCollectionRepository implements CollectionRepository {
  private readonly collections = new Map<string, Collection>();

  constructor(seed: Collection[] = []) {
    for (const collection of seed) this.collections.set(collection.id, copyCollection(collection));
  }

  async list(): Promise<Collection[]> {
    return Array.from(this.collections.values(), copyCollection);
  }

  async save(collection: Collection): Promise<void> {
    this.collections.set(collection.id, copyCollection(collection));
  }

  async remove(collectionId: string): Promise<void> {
    this.collections.delete(collectionId);
  }
}

/** This changes demo entitlement only; it never initiates a purchase. */
export class MockSubscriptionService implements SubscriptionService {
  constructor(private plan: Plan = 'free') {}

  async getEntitlement(): Promise<SubscriptionEntitlement> {
    return getEntitlements(this.plan);
  }

  async setPlan(plan: Plan): Promise<SubscriptionEntitlement> {
    this.plan = plan;
    return this.getEntitlement();
  }
}

export const mockCatalogService = new MockCardCatalogService();
export const recognitionService = new MockCardRecognitionService();
export const mockPricingService = new MockMarketPricingService();
export const collectionRepository = new MockCollectionRepository();
export const subscriptionService = new MockSubscriptionService();
