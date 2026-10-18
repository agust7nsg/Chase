import { Image } from 'expo-image';
import { useState } from 'react';
import { View, type ImageStyle } from 'react-native';
import type { Card } from '@/types/domain';
import { visualFor } from '@/data/cardVisuals';
import { colors } from '@/theme/tokens';
import { Icon, Label } from './ui';

export function CardPrint({ card, style }: { card: Card; style?: ImageStyle }) {
  const source = visualFor(card).source;
  const imageId = typeof source === 'number' ? String(source) : source?.uri;
  const [failedImage, setFailedImage] = useState<string>();
  if (!source || failedImage === imageId) return <View accessible accessibilityRole="image" accessibilityLabel={`${card.name}: artwork unavailable`}
    style={[{ width: '100%', aspectRatio: 600 / 825, borderRadius: 7, backgroundColor: colors.subtle, alignItems: 'center', justifyContent: 'center', gap: 8 }, style]}>
    <Icon name="image-outline" color={colors.muted} /><Label kind="caption" style={{ color: colors.muted, textAlign: 'center' }}>No artwork</Label>
  </View>;
  return <Image source={source} contentFit="contain" cachePolicy="memory-disk" recyclingKey={card.id}
    onError={() => setFailedImage(imageId)} style={[{ width: '100%', aspectRatio: 600 / 825, borderRadius: 7 }, style]}
    accessibilityLabel={`${card.name}, ${card.setName}, ${card.collectorNumber}, Pokémon TCG card`} />;
}
