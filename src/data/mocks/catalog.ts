import type { Card } from '../../types/domain';

const priceUpdatedAt = '2026-10-01T00:00:00.000Z';

function price(amount: number): Card['marketPrice'] {
  return { amount, currency: 'USD', source: 'mock', updatedAt: priceUpdatedAt };
}

/** Representative mock estimates for ungraded cards; these are not live prices. */
export const catalog: Card[] = [
  {
    id: 'base1-4',
    name: 'Charizard',
    setName: 'Base Set',
    collectorNumber: '4/102',
    variant: 'Holo',
    imageKey: 'charizard',
    marketPrice: price(245),
  },
  {
    id: 'xy12-35',
    name: 'Pikachu',
    setName: 'Evolutions',
    collectorNumber: '35/108',
    variant: 'Normal',
    imageKey: 'pikachu',
    marketPrice: price(1.25),
  },
  {
    id: 'base1-2',
    name: 'Blastoise',
    setName: 'Base Set',
    collectorNumber: '2/102',
    variant: 'Holo',
    imageKey: 'blastoise',
    marketPrice: price(88.5),
  },
  {
    id: 'base1-15',
    name: 'Venusaur',
    setName: 'Base Set',
    collectorNumber: '15/102',
    variant: 'Holo',
    imageKey: 'venusaur',
    marketPrice: price(69.75),
  },
  {
    id: 'base2-68',
    name: 'Eevee',
    setName: 'Base Set 2',
    collectorNumber: '68/130',
    variant: 'Normal',
    imageKey: 'eevee',
    marketPrice: price(2.4),
  },
  {
    id: 'swshp-053',
    name: 'Mew',
    setName: 'SWSH Black Star Promos',
    collectorNumber: 'SWSH053',
    variant: 'Holo',
    imageKey: 'mew',
    marketPrice: price(7.65),
  },
  {
    id: 'xy12-35-reverse',
    name: 'Pikachu',
    setName: 'Evolutions',
    collectorNumber: '35/108',
    variant: 'Reverse holo',
    imageKey: 'pikachu',
    marketPrice: price(4.2),
  },
];

export function getCatalogCard(cardId: string): Card | undefined {
  return catalog.find((card) => card.id === cardId);
}
