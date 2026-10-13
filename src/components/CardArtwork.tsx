import { Image } from 'expo-image';
import { StyleSheet, View, type ImageStyle } from 'react-native';
import type { Card } from '@/types/domain';
import { colors } from '@/theme/tokens';
import { Icon, Label } from './ui';

const images: Record<string, number> = {
  charizard: require('../../assets/cards/charizard.png'), pikachu: require('../../assets/cards/pikachu.png'),
  blastoise: require('../../assets/cards/blastoise.png'), venusaur: require('../../assets/cards/venusaur.png'),
  eevee: require('../../assets/cards/eevee.png'), mew: require('../../assets/cards/mew.png'),
};
const artSurfaces: Record<string, string> = {
  charizard: '#FFF0E4', pikachu: '#FFF6D9', blastoise: '#E7F1FF',
  venusaur: '#EAF5EE', eevee: '#F5EDE4', mew: '#F2EBFC',
};
export function CardIllustration({ card, style }: { card: Card; style?: ImageStyle }) {
  return <Image source={images[card.imageKey]} contentFit="contain" style={[{ width: '100%', aspectRatio: 1 }, style]} cachePolicy="memory-disk" accessible={false} />;
}
/** Bundled character illustration in a sample frame, never an actual TCG scan. */
export function CardArtwork({ card, compact = false, showSample = true }: { card: Card; compact?: boolean; showSample?: boolean }) {
  if (compact) return <View style={[styles.compact, { backgroundColor: artSurfaces[card.imageKey] ?? colors.primarySoft }]} accessible accessibilityLabel={`${card.name}, sample artwork`}>
    <CardIllustration card={card} style={{ width: '94%', alignSelf: 'center' }} />
    {showSample ? <View style={styles.sample}><Label style={styles.sampleText}>SAMPLE</Label></View> : null}
  </View>;
  return <View style={styles.card} accessible accessibilityLabel={`${card.name}, sample artwork, ${card.variant}`}>
    <View style={styles.header}><Label style={{ fontWeight: '700', flexShrink: 1 }}>{card.name}</Label><Icon name="sparkles-outline" size={16} color={colors.primary} /></View>
    <View style={[styles.art, { backgroundColor: artSurfaces[card.imageKey] ?? colors.primarySoft }]}><CardIllustration card={card} /></View>
    <View style={styles.header}><Label kind="caption" style={{ color: colors.muted }}>Sample artwork</Label><Label kind="caption" style={{ color: colors.primary, fontWeight: '600' }}>{card.variant}</Label></View>
  </View>;
}
/** Static layers give artwork a collector-card presentation without motion. */
export function CardStage({ card, compact = false }: { card: Card; compact?: boolean }) {
  return <View style={[styles.stage, compact && { padding: 20 }]}>
    <View style={styles.stageMark} accessible={false}><Icon name="layers-outline" size={68} color={colors.tintBorder} /></View>
    <View style={[styles.stageCard, compact && { maxWidth: 200 }]}>
      <View style={styles.backCard} />
      <View style={styles.frontCard}><CardArtwork card={card} /></View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  compact: { width: '100%', borderRadius: 10, padding: 6, overflow: 'hidden' },
  sample: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: colors.white, borderRadius: 4 },
  sampleText: { color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8 },
  card: { padding: 12, borderRadius: 14, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.white, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  art: { borderRadius: 8, padding: 8 },
  stage: { width: '100%', backgroundColor: colors.primarySoft, borderRadius: 24, padding: 28, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: colors.tintBorder },
  stageMark: { position: 'absolute', right: -10, top: 12, transform: [{ rotate: '12deg' }] },
  stageCard: { width: '84%', maxWidth: 240 },
  backCard: { position: 'absolute', top: 4, bottom: 4, left: -8, right: 0, borderRadius: 14, borderWidth: 1, borderColor: '#B8CEFA', backgroundColor: '#D5E3FF', transform: [{ rotate: '-9deg' }] },
  frontCard: { transform: [{ rotate: '3deg' }], shadowColor: colors.text, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
});
