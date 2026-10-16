import { Image } from 'expo-image';
import { type ImageStyle } from 'react-native';
import type { Card } from '@/types/domain';
import { visualFor } from '@/data/cardVisuals';

export function CardPrint({ card, style }: { card: Card; style?: ImageStyle }) {
  return <Image source={visualFor(card).source} contentFit="contain" cachePolicy="memory-disk"
    style={[{ width: '100%', aspectRatio: 600 / 825, borderRadius: 7 }, style]}
    accessibilityLabel={`${card.name}, ${card.setName}, ${card.collectorNumber}, Pokémon TCG card`} />;
}
