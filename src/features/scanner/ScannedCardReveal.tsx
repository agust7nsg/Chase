import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { CardPrint } from '@/components/CardPrint';
import { Label } from '@/components/ui';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { colors } from '@/theme/tokens';
import type { ScanSessionItem } from '@/types/scanner';

/** Presentation-only feedback: animation completion never controls recognition or saving. */
export function ScannedCardReveal({ item, count, eventId, onDismiss }: { item: ScanSessionItem; count: number; eventId: number; onDismiss: (id: number) => void }) {
  const { currency, formatMoney } = useCurrency();
  const { height, width } = useWindowDimensions();
  const card = item.card ?? getCatalogCard(item.cardId);
  const [progress] = useState(() => new Animated.Value(0));
  const [exitOpacity] = useState(() => new Animated.Value(1));
  const [artSettled, setArtSettled] = useState(!card);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [countAtRecognition] = useState(count);
  const settleArtwork = useCallback(() => setArtSettled(true), []);
  const priced = item.priceState === 'available' && item.price !== null;
  const price = priced ? formatMoney(item.price!.amount, item.price!.currency)
    : item.priceState === 'loading' ? 'Loading price…' : 'Price unavailable';
  useEffect(() => {
    // Android uses the live region below; VoiceOver needs an explicit event.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`${item.name}. ${countAtRecognition} pending cards.`);
  }, [item.name, countAtRecognition]);
  useEffect(() => {
    let mounted = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (mounted) setReduceMotion(reduce);
    }).catch(() => { if (mounted) setReduceMotion(true); });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!artSettled || reduceMotion === null) return;
    if (reduceMotion) { progress.setValue(1); return; }
    const animation = Animated.timing(progress, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => { animation.stop(); };
  }, [artSettled, reduceMotion, progress]);
  useEffect(() => {
    // Do not spend the confirmation interval waiting on the image network.
    // A stuck download is bounded; a new recognition always replaces this reveal.
    let leaving: Animated.CompositeAnimation | undefined;
    const timer = setTimeout(() => {
      if (!artSettled || reduceMotion) { onDismiss(eventId); return; }
      leaving = Animated.timing(exitOpacity, { toValue: 0, duration: 180, useNativeDriver: true });
      leaving.start(({ finished }) => { if (finished) onDismiss(eventId); });
    }, artSettled ? 3000 : 6000);
    return () => { clearTimeout(timer); leaving?.stop(); };
  }, [artSettled, reduceMotion, eventId, onDismiss, exitOpacity]);
  const cardWidth = Math.min(184, width * 0.46, height * (width > height ? 0.19 : 0.23));
  return <View testID="scan-card-reveal" pointerEvents="none" accessible accessibilityLiveRegion="polite"
    accessibilityLabel={`Recognized ${item.name}. ${countAtRecognition} pending cards. ${price}`}
    style={styles.reveal}>
    <Animated.View style={[styles.reveal, { opacity: Animated.multiply(exitOpacity, progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] })),
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [Math.min(height * 0.45, 360), 0] }) }] }]}>
      {card ? <View testID="scan-card-artwork" style={styles.art}><CardPrint card={card} style={{ width: cardWidth }} onLoad={settleArtwork} onError={settleArtwork} /></View> : null}
      <View style={styles.caption}>
        <Label style={styles.name}>{item.name}</Label>
        <Label testID="scan-card-price" style={priced ? styles.price : styles.priceUnavailable}>{price}</Label>
        {priced ? <Label kind="caption" style={styles.estimate}>Market estimate · {currency}</Label> : null}
      </View>
    </Animated.View>
    {!artSettled ? <View style={styles.loading}><ActivityIndicator color={colors.white} /><Label kind="caption" style={styles.estimate}>Loading artwork…</Label></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  reveal: { alignItems: 'center', gap: 10, alignSelf: 'center', maxWidth: '100%' },
  art: { borderRadius: 9, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)' },
  caption: { backgroundColor: colors.scanner, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12, gap: 2, alignItems: 'center', maxWidth: '100%' },
  name: { color: colors.white, fontWeight: '600', textAlign: 'center' },
  price: { color: colors.scannerPrice, fontSize: 32, lineHeight: 38, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'center' },
  priceUnavailable: { color: colors.scannerMuted, textAlign: 'center' },
  estimate: { color: colors.scannerMuted, textAlign: 'center' },
  loading: { position: 'absolute', bottom: 0, backgroundColor: colors.scanner, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
