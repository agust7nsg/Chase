import { useCurrency } from '@/features/currency/CurrencyProvider';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CardArtwork } from '@/components/CardArtwork';

import { Label } from '@/components/ui';
import { colors } from '@/theme/tokens';
import type { Card } from '@/types/domain';
export function CardTile({ card, quantity, width }: { card: Card; quantity?: number; width?: number }) {
  const { formatMoney: money } = useCurrency();
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${card.name}, ${card.setName}, ${card.variant}${quantity ? `, ${quantity} copies` : ''}`}
    onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
    style={({ pressed }) => [styles.tile, width !== undefined ? { width, flexGrow: 0, flexShrink: 0 } : { flex: 1 }, pressed && { opacity: 0.65 }]}>
    <View><CardArtwork card={card} compact />{quantity ? <View style={styles.quantity}><Label kind="caption" style={{ color: colors.primary, fontWeight: '700' }}>×{quantity}</Label></View> : null}</View>
    <View style={styles.info}>
      <Label style={{ fontWeight: '600' }}>{card.name}</Label>
      <Label kind="caption" numberOfLines={1} style={{ color: colors.muted }}>{card.setName}</Label>
      <Label kind="caption" style={{ color: colors.muted }}>{card.variant} · {card.collectorNumber}</Label>
      <Label style={{ fontWeight: '700', paddingTop: 3, fontVariant: ['tabular-nums'] }}>{money(card.marketPrice.amount)}</Label>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  tile: { minWidth: 0, gap: 10, paddingBottom: 14 },
  info: { gap: 2, paddingHorizontal: 2, paddingBottom: 5 },
  quantity: { position: 'absolute', bottom: 8, right: 8, minWidth: 28, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.white },
});
