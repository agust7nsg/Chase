import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import type { Card } from '@/types/domain';
import { colors } from '@/theme/tokens';
import { Label } from './ui';
const images: Record<string, number> = {
  charizard: require('../../assets/cards/charizard.png'), pikachu: require('../../assets/cards/pikachu.png'),
  blastoise: require('../../assets/cards/blastoise.png'), venusaur: require('../../assets/cards/venusaur.png'),
  eevee: require('../../assets/cards/eevee.png'), mew: require('../../assets/cards/mew.png'),
};
/** Sample frame and Pokémon illustration, never represented as an actual TCG printing. */
export function CardArtwork({ card, compact = false }: { card: Card; compact?: boolean }) {
  return <View style={[styles.card, compact && { padding: 10 }]} accessible accessibilityLabel={`${card.name}, sample artwork, ${card.variant}`}>
    <View style={styles.header}><Label kind={compact ? 'caption' : 'body'} style={{ fontWeight: '700', flexShrink: 1 }}>{card.name}</Label><Label kind="caption" style={{ color: colors.muted }}>DEMO</Label></View>
    <Image source={images[card.imageKey]} contentFit="contain" style={styles.art} cachePolicy="memory-disk" accessible={false} />
    <View style={styles.footer}><Label kind="caption" style={{ color: colors.muted }}>Sample artwork</Label><Label kind="caption" style={{ color: colors.primary }}>{card.variant}</Label></View>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 12, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.white, gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  art: { width: '100%', aspectRatio: 1, backgroundColor: colors.surface, borderRadius: 6 },
  footer: { gap: 2 },
});
