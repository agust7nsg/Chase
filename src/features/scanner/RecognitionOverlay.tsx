import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { CardPrint } from '@/components/CardPrint';
import { Icon, Label } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import type { ScanSessionItem, PendingCatalogRecognition } from '@/types/scanner';
export function RecognitionOverlay({ item, count }: { item: ScanSessionItem; count: number }) {
  const { formatMoney } = useCurrency();
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => { if (active) Animated.timing(opacity, { toValue: 1, duration: reduce ? 0 : 180, useNativeDriver: true }).start(); });
    return () => { active = false; opacity.stopAnimation(); };
  }, [opacity]);
  const card = getCatalogCard(item.cardId)!;
  return <Animated.View style={[styles.result, { opacity }]} accessibilityLiveRegion="polite" accessible accessibilityLabel={`${item.name}. ${count} pending cards. ${item.priceState === 'available' && item.price ? formatMoney(item.price.amount, item.price.currency) : item.priceState === 'loading' ? 'Price loading' : 'Price unavailable'}`}>
    <CardPrint card={card} style={{ width: 42 }} />
    <View style={{ flex: 1, gap: 2 }}><Label style={{ fontWeight: '700' }}>{item.name}</Label><Label kind="caption" style={{ color: colors.muted }}>{item.setName} · {item.collectorNumber}</Label><Label kind="caption" style={{ color: colors.primary }}>{item.ambiguity === 'review' ? 'Review variant in Organize' : 'Added to session'}</Label></View>
    <Label style={{ fontWeight: '700', flexShrink: 1 }}>{item.priceState === 'available' && item.price ? formatMoney(item.price.amount, item.price.currency) : item.priceState === 'loading' ? 'Loading…' : 'Price unavailable'}</Label>
  </Animated.View>;
}
export function PendingRecognitionOverlay({ item }: { item: PendingCatalogRecognition }) {
  const candidate = item.recognition.candidates[0];
  return <View style={styles.result} accessibilityLiveRegion="polite">
    <Icon name="albums-outline" color={colors.primary} size={30} />
    <View style={{ flex: 1, gap: 2 }}><Label style={{ fontWeight: '700' }}>{candidate.name}</Label>
      <Label kind="caption" style={{ color: colors.muted }}>{candidate.setName} · {candidate.collectorNumber}</Label>
      <Label kind="caption" style={{ color: colors.primary }}>Match printing in Organize</Label></View>
  </View>;
}
const styles = StyleSheet.create({ result: { backgroundColor: colors.white, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 } });
