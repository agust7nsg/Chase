import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Card } from '@/types/domain';
import { Icon, Label, uiStyles } from './ui';
import { CardArtwork } from './CardArtwork';
import { colors } from '@/theme/tokens';
export function money(amount: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount); }
export function CardRow({ card, quantity }: { card: Card; quantity?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${card.name}, ${card.variant}${quantity ? `, ${quantity} copies` : ''}`} onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })} style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}>
    <View style={styles.thumb}><CardArtwork card={card} compact showSample={false} /></View>
    <View style={{ flex: 1, minWidth: 100, gap: 4 }}><Label style={{ fontWeight: '600' }}>{card.name}</Label><Label kind="caption" style={uiStyles.muted}>{card.setName} · {card.variant}</Label>{quantity ? <Label kind="caption" style={uiStyles.muted}>×{quantity} {quantity === 1 ? 'copy' : 'copies'}</Label> : null}</View>
    <View style={{ alignItems: 'flex-end', gap: 6 }}><Label style={{ fontWeight: '700' }}>{money(card.marketPrice.amount)}</Label><Icon name="chevron-forward" size={16} color={colors.muted} /></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, minHeight: 96, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, marginTop: 10 },
  thumb: { width: 62 },
});
