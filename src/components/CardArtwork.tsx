import { StyleSheet, View } from 'react-native';
import type { Card } from '@/types/domain';
import { visualFor } from '@/data/cardVisuals';
import { colors } from '@/theme/tokens';
import { CardPrint } from './CardPrint';
import { Label } from './ui';

export function CardArtwork({ card, compact = false }: { card: Card; compact?: boolean }) {
  return <View style={compact ? undefined : styles.shadow}><CardPrint card={card} /></View>;
}
export function CardStage({ card, compact = false }: { card: Card; compact?: boolean }) {
  const visual = visualFor(card);
  return <View style={styles.stage}>
    <View style={[styles.heroPrint, compact && { maxWidth: 208 }]}><CardArtwork card={card} /></View>
    <Label kind="caption" style={styles.edition}>{visual.edition} · {card.collectorNumber}</Label>
  </View>;
}
const styles = StyleSheet.create({
  shadow: { shadowColor: colors.text, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 3, borderRadius: 7 },
  stage: { marginHorizontal: -24, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 18, backgroundColor: colors.subtle, alignItems: 'center', gap: 18 },
  heroPrint: { width: '64%', maxWidth: 248 },
  edition: { color: colors.muted, textAlign: 'center' },
});
