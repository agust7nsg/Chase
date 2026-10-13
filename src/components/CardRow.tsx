import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { Card } from '@/types/domain';
import { Icon, Label, uiStyles } from './ui';
import { colors } from '@/theme/tokens';
export function money(amount: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount); }
const images: Record<string, number> = { charizard: require('../../assets/cards/charizard.png'), pikachu: require('../../assets/cards/pikachu.png'), blastoise: require('../../assets/cards/blastoise.png'), venusaur: require('../../assets/cards/venusaur.png'), eevee: require('../../assets/cards/eevee.png'), mew: require('../../assets/cards/mew.png') };
export function CardRow({ card, quantity }: { card: Card; quantity?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${card.name}, ${card.variant}${quantity ? `, ${quantity} copies` : ''}`} onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })} style={({ pressed }) => [uiStyles.row, { minHeight: 90, paddingVertical: 12, opacity: pressed ? 0.65 : 1, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
    <Image source={images[card.imageKey]} contentFit="contain" style={{ width: 60, height: 72, borderRadius: 6, backgroundColor: colors.surface }} />
    <View style={{ flex: 1, gap: 3 }}><Label style={{ fontWeight: '600' }}>{card.name}</Label><Label kind="caption" style={uiStyles.muted}>{card.setName} · {card.variant}{quantity ? ` · ×${quantity}` : ''}</Label><Label kind="caption">{money(card.marketPrice.amount)} <Label kind="caption" style={uiStyles.muted}>demo / copy</Label></Label></View><Icon name="chevron-forward" size={18} color={colors.muted} />
  </Pressable>;
}
