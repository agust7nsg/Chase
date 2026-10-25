import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View, type ImageStyle } from 'react-native';
import type { Card } from '@/types/domain';
import { cardVisuals, visualFor } from '@/data/cardVisuals';
import { colors } from '@/theme/tokens';
import { cardArtworkSources } from '@/services/tcgdex/artwork';
import { Icon, Label } from './ui';

export function CardPrint({ card, style, onLoad, onError }: { card: Card; style?: ImageStyle; onLoad?: () => void; onError?: () => void }) {
  const advertised = visualFor(card).source;
  const bundledSource = cardVisuals[card.id]?.source;
  const imageId = `${card.id}:${typeof advertised === 'number' || typeof advertised === 'string' ? advertised : advertised?.uri ?? ''}`;
  const remoteUri = typeof advertised === 'string' ? advertised : typeof advertised === 'object' ? advertised?.uri : undefined;
  // Metro resolves bundled artwork to numeric native IDs or local web URIs.
  // Only remote catalog URLs belong in the HTTPS/alternate-encoding resolver.
  const sources = bundledSource !== undefined ? [bundledSource] : cardArtworkSources(remoteUri).map(uri => ({ uri }));
  const [attempt, setAttempt] = useState({ imageId, index: 0 });
  const index = attempt.imageId === imageId ? attempt.index : 0;
  const source = sources[index];
  useEffect(() => { if (!source) onError?.(); }, [source, onError]);
  if (!source) return <View accessible accessibilityRole="image" accessibilityLabel={`${card.name}: artwork unavailable`}
    style={[{ width: '100%', aspectRatio: 600 / 825, borderRadius: 7, backgroundColor: colors.subtle, alignItems: 'center', justifyContent: 'center', gap: 8 }, style]}>
    <Icon name="image-outline" color={colors.muted} /><Label kind="caption" style={{ color: colors.muted, textAlign: 'center' }}>No artwork</Label>
  </View>;
  return <Image key={`${imageId}:${index}`} source={source} contentFit="contain" cachePolicy="memory-disk" recyclingKey={card.id}
    onLoad={() => onLoad?.()} onError={() => setAttempt({ imageId, index: index + 1 })} style={[{ width: '100%', aspectRatio: 600 / 825, borderRadius: 7 }, style]}
    accessibilityLabel={`${card.name}, ${card.setName}, ${card.collectorNumber}, Pokémon TCG card`} />;
}
