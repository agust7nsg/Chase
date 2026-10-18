import type { Card, MarketPrice } from '../../types/domain';
import { getRegisteredCard, registerCatalogCard } from '../catalogRegistry';

const priceUpdatedAt = '2026-10-01T00:00:00.000Z';

export type LegacyCard = Card & { marketPrice: MarketPrice };

function price(amount: number): MarketPrice {
  return { amount, currency: 'USD', source: 'mock', updatedAt: priceUpdatedAt };
}

/** Representative mock estimates for ungraded cards; these are not live prices. */
export const catalog: LegacyCard[] = [
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
    // Retain the original prototype storage key; the actual printing is 51/130.
    id: 'base2-68',
    name: 'Eevee',
    setName: 'Base Set 2',
    collectorNumber: '51/130',
    variant: 'Normal',
    imageKey: 'eevee',
    marketPrice: price(2.4),
  },
  {
    // Retain the original prototype storage key; the actual printing is Wizards promo 9.
    id: 'swshp-053',
    name: 'Mew',
    setName: 'Wizards Black Star Promos',
    collectorNumber: '9',
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
  { id: 'swsh7-215', name: 'Umbreon VMAX', setName: 'Evolving Skies', collectorNumber: '215/203', variant: 'Holo', imageKey: 'umbreon', marketPrice: price(650) },
  { id: 'swsh7-218', name: 'Rayquaza VMAX', setName: 'Evolving Skies', collectorNumber: '218/203', variant: 'Holo', imageKey: 'rayquaza', marketPrice: price(280) },
  { id: 'swsh7-192', name: 'Dragonite V', setName: 'Evolving Skies', collectorNumber: '192/203', variant: 'Holo', imageKey: 'dragonite', marketPrice: price(95) },
  { id: 'swsh8-271', name: 'Gengar VMAX', setName: 'Fusion Strike', collectorNumber: '271/264', variant: 'Holo', imageKey: 'gengar', marketPrice: price(310) },
  { id: 'swsh11-186', name: 'Giratina V', setName: 'Lost Origin', collectorNumber: '186/196', variant: 'Holo', imageKey: 'giratina', marketPrice: price(290) },
  { id: 'swsh12-186', name: 'Lugia V', setName: 'Silver Tempest', collectorNumber: '186/195', variant: 'Holo', imageKey: 'lugia', marketPrice: price(155) },
  { id: 'sv2-203', name: 'Magikarp', setName: 'Paldea Evolved', collectorNumber: '203/193', variant: 'Holo', imageKey: 'magikarp', marketPrice: price(85) },
  { id: 'xyp-XY133', name: 'Ash-Greninja EX', setName: 'XY Black Star Promos', collectorNumber: 'XY133', variant: 'Holo', imageKey: 'greninja', marketPrice: price(28) },
  { id: 'sv6-214', name: 'Greninja ex', setName: 'Twilight Masquerade', collectorNumber: '214/167', variant: 'Holo', imageKey: 'greninja-ex', marketPrice: price(300) },
  { id: 'swsh8-269', name: 'Mew VMAX', setName: 'Fusion Strike', collectorNumber: '269/264', variant: 'Holo', imageKey: 'mew-vmax', marketPrice: price(120) },
];

catalog.forEach(registerCatalogCard);

export function getLegacyCard(cardId: string): LegacyCard | undefined {
  return catalog.find((card) => card.id === cardId);
}

export function getCatalogCard(cardId: string): Card | undefined {
  return getLegacyCard(cardId) ?? getRegisteredCard(cardId);
}
