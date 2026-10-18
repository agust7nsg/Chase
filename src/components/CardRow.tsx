import { useCurrency } from '@/features/currency/CurrencyProvider';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Card } from '@/types/domain';
import { Icon, Label, uiStyles } from './ui';
import { CardArtwork } from './CardArtwork';
import { colors } from '@/theme/tokens';
export function CardRow({ card, quantity }: { card: Card; quantity?: number }) {
  const { formatMoney: money } = useCurrency();
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${card.name}, ${card.variant}${quantity ? `, ${quantity} copies` : ''}`} onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })} style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}>
    <View style={styles.thumb}><CardArtwork card={card} compact /></View>
    <View style={{ flex: 1, minWidth: 100, gap: 4 }}><Label style={{ fontWeight: '600' }}>{card.name}</Label><Label kind="caption" style={uiStyles.muted}>{card.setName} · {card.variant}</Label>{quantity ? <Label kind="caption" style={uiStyles.muted}>×{quantity} {quantity === 1 ? 'copy' : 'copies'}</Label> : null}</View>
    <View style={{ alignItems: 'flex-end', gap: 6 }}><Label style={{ fontWeight: '700' }}>{card.marketPrice ? money(card.marketPrice.amount, card.marketPrice.currency) : 'Price unavailable'}</Label><Icon name="chevron-forward" size={16} color={colors.muted} /></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, minHeight: 106, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 12, marginTop: 4 },
  thumb: { width: 58 },
});
