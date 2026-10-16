import type { Card } from '@/types/domain';

export type CollectorMood = 'moon' | 'sky' | 'ember' | 'garden' | 'cosmic';
type CardVisual = { source: number; mood: CollectorMood; note?: string; edition: string };

/** Verified local printing images. The legacy inventory keys stay stable. */
export const cardVisuals: Record<string, CardVisual> = {
  'base1-4': { source: require('../../assets/chases/base1-4.webp'), mood: 'ember', edition: 'First edition image', note: 'First edition reference image. The sample price does not distinguish editions or condition.' },
  'base1-2': { source: require('../../assets/chases/base1-2.webp'), mood: 'sky', edition: 'Base Set' },
  'base1-15': { source: require('../../assets/chases/base1-15.webp'), mood: 'garden', edition: 'Base Set' },
  'base2-68': { source: require('../../assets/chases/base2-68.webp'), mood: 'garden', edition: 'Base Set 2' },
  'xy12-35': { source: require('../../assets/chases/xy12-35.webp'), mood: 'ember', edition: 'Evolutions' },
  'xy12-35-reverse': { source: require('../../assets/chases/xy12-35.webp'), mood: 'ember', edition: 'Printing reference', note: 'Printing reference image; the reverse-holo finish is not shown.' },
  'swshp-053': { source: require('../../assets/chases/swshp-053.webp'), mood: 'cosmic', edition: 'Wizards promo 9' },
  'swsh7-215': { source: require('../../assets/chases/swsh7-215.webp'), mood: 'moon', edition: 'Alternate art' },
  'swsh7-218': { source: require('../../assets/chases/swsh7-218.webp'), mood: 'sky', edition: 'Alternate art' },
  'swsh7-192': { source: require('../../assets/chases/swsh7-192.webp'), mood: 'sky', edition: 'Alternate art' },
  'swsh8-271': { source: require('../../assets/chases/swsh8-271.webp'), mood: 'cosmic', edition: 'Alternate art' },
  'swsh11-186': { source: require('../../assets/chases/swsh11-186.webp'), mood: 'cosmic', edition: 'Alternate art' },
  'swsh12-186': { source: require('../../assets/chases/swsh12-186.webp'), mood: 'sky', edition: 'Alternate art' },
  'sv2-203': { source: require('../../assets/chases/sv2-203.webp'), mood: 'sky', edition: 'Illustration rare' },
  'xyp-XY133': { source: require('../../assets/chases/xyp-XY133.webp'), mood: 'sky', edition: 'XY promo' },
};
export function visualFor(card: Card): CardVisual { return cardVisuals[card.id]; }
/** A fixed editorial selection, never personalized recommendations. */
export const showcaseIds = ['swsh7-215', 'swsh7-218', 'swsh11-186', 'swsh12-186', 'swsh8-271', 'sv2-203'] as const;
