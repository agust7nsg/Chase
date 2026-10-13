import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CardArtwork } from '@/components/CardArtwork';
import { money } from '@/components/CardRow';
import { Label } from '@/components/ui';
import { colors } from '@/theme/tokens';
import type { Card } from '@/types/domain';

export function CardTile({ card, quantity, width }: { card: Card; quantity?: number; width?: number }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`View ${card.name}, ${card.setName}, ${card.variant}${quantity ? `, ${quantity} copies` : ''}`}
    onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
    style={({ pressed }) => [styles.tile, width !== undefined ? { width, flexGrow: 0, flexShrink: 0 } : { flex: 1 }, pressed && { opacity: 0.65 }]}
  >
    <CardArtwork card={card} compact />
    <View style={styles.info}>
      <Label style={{ fontWeight: '600' }}>{card.name}</Label>
      <Label kind="caption" style={{ color: colors.muted }}>{card.setName} · {card.collectorNumber}</Label>
      <Label kind="caption" style={{ color: colors.muted }}>{card.variant}{quantity ? ` · ×${quantity}` : ''}</Label>
      <Label style={{ color: colors.primary, fontWeight: '600' }}>{money(card.marketPrice.amount)}</Label>
      <Label kind="caption" style={{ color: colors.muted }}>Demo USD / copy</Label>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  tile: { minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 8, gap: 10, backgroundColor: colors.white },
  info: { gap: 3, paddingHorizontal: 3, paddingBottom: 5 },
});
