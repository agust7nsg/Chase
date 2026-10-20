import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { CardPrint } from '@/components/CardPrint';
import { Label } from '@/components/ui';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { colors } from '@/theme/tokens';
import type { ScanSessionItem } from '@/types/scanner';

/** Presentation-only feedback: animation completion never controls recognition or saving. */
export function ScannedCardReveal({ item, count }: { item: ScanSessionItem; count: number }) {
  const { formatMoney } = useCurrency();
  const { height, width } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [countAtRecognition] = useState(count);
  const card = item.card ?? getCatalogCard(item.cardId);
  const price = item.priceState === 'available' && item.price ? formatMoney(item.price.amount, item.price.currency)
    : item.priceState === 'loading' ? 'Loading price…' : 'Price unavailable';
  useEffect(() => {
    // Android uses the live region below; VoiceOver needs an explicit event.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`${item.name}. ${countAtRecognition} pending cards.`);
  }, [item.name, countAtRecognition]);
  useEffect(() => {
    let mounted = true;
    let animation: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!mounted) return;
      if (reduce) { progress.setValue(1); return; }
      animation = Animated.timing(progress, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true });
      animation.start();
    }).catch(() => { if (mounted) progress.setValue(1); });
    return () => { mounted = false; animation?.stop(); progress.stopAnimation(); };
  }, [progress]);
  const cardWidth = Math.min(164, width * 0.4, height * 0.23);
  return <Animated.View testID="scan-card-reveal" pointerEvents="none" accessible accessibilityLiveRegion="polite"
    accessibilityLabel={`Recognized ${item.name}. ${countAtRecognition} pending cards. ${price}`}
    style={[styles.reveal, { opacity: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [Math.min(height * 0.45, 360), 0] }) }] }]}>
    {card ? <View style={styles.art}><CardPrint card={card} style={{ width: cardWidth }} /></View> : null}
    <View style={styles.caption}>
      <Label style={styles.name}>{item.name}</Label>
      <Label kind="caption" style={styles.price}>{price}</Label>
    </View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  reveal: { alignItems: 'center', gap: 10, alignSelf: 'center', maxWidth: '100%' },
  art: { borderRadius: 9, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)' },
  caption: { backgroundColor: colors.scanner, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center', maxWidth: '100%' },
  name: { color: colors.white, fontWeight: '700', textAlign: 'center' },
  price: { color: colors.scannerMuted, textAlign: 'center' },
});
