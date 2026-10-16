import { StyleSheet, View } from 'react-native';
import type { Card } from '@/types/domain';
import { visualFor } from '@/data/cardVisuals';
import { colors } from '@/theme/tokens';
import { CollectorBackdrop } from './CollectorScene';
import { CardPrint } from './CardPrint';
import { Label } from './ui';

export function CardArtwork({ card, compact = false }: { card: Card; compact?: boolean }) {
  return <View style={compact ? undefined : styles.shadow}><CardPrint card={card} /></View>;
}
export function CardStage({ card, compact = false }: { card: Card; compact?: boolean }) {
  const visual = visualFor(card);
  return <View style={styles.stage}>
    <CollectorBackdrop mood={visual.mood} />
    <View style={[styles.heroPrint, compact && { maxWidth: 208 }]}><CardArtwork card={card} /></View>
    <Label kind="eyebrow" style={styles.edition}>{visual.edition}</Label>
  </View>;
}
const styles = StyleSheet.create({
  shadow: { shadowColor: colors.text, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 4, borderRadius: 7 },
  stage: { marginHorizontal: -24, paddingHorizontal: 40, paddingTop: 24, paddingBottom: 16, alignItems: 'center', gap: 20, overflow: 'hidden' },
  heroPrint: { width: '68%', maxWidth: 248, transform: [{ rotate: '-3deg' }] },
  edition: { color: colors.muted, textAlign: 'center' },
});
