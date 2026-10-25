import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, useWindowDimensions, View, type KeyDownEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { CardPrint } from '@/components/CardPrint';

import { Icon, Label } from '@/components/ui';
import { getLegacyCard } from '@/data/mocks/catalog';
import { colors } from '@/theme/tokens';

const cards = ['swsh7-215', 'base1-4', 'sv6-214', 'swsh7-218', 'swsh11-186'].map(id => getLegacyCard(id)!);
const initialIndex = 1;

/** A local price demonstration; swiping never saves ownership or spends a scan. */
export function PriceCarousel() {
  const { currency, formatMoney: money } = useCurrency();
  const { width, height } = useWindowDimensions();
  const stageWidth = Math.min(width, 760);
  const printWidth = Math.min(stageWidth * 0.55, height < 740 ? 170 : 218);
  const interval = printWidth + 24;
  const stageHeight = printWidth * 825 / 600 + 32;
  const scroll = useRef<ScrollViewInstance>(null);
  const [scrollX] = useState(() => new Animated.Value(initialIndex * interval));
  const selectedRef = useRef(initialIndex);
  const [selected, setSelected] = useState(initialIndex);
  const card = cards[selected];

  useLayoutEffect(() => { selectedRef.current = selected; }, [selected]);

  useLayoutEffect(() => {
    const offset = selectedRef.current * interval;
    scrollX.setValue(offset);
    scroll.current?.scrollTo({ x: offset, animated: false });
  }, [interval, scrollX]);

  const goTo = (index: number) => {
    scroll.current?.scrollTo({ x: Math.max(0, Math.min(cards.length - 1, index)) * interval, animated: false });
  };
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
    useNativeDriver: Platform.OS !== 'web',
    listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.max(0, Math.min(cards.length - 1, Math.round(event.nativeEvent.contentOffset.x / interval)));
      setSelected(index);
    },
  });
  const keyboardProps = Platform.OS === 'web' ? {
    tabIndex: 0 as const,
    onKeyDown: (event: KeyDownEvent) => {
      const key = 'key' in event && typeof event.key === 'string' ? event.key : event.nativeEvent.key;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
        event.preventDefault();
        goTo(key === 'Home' ? 0 : key === 'End' ? cards.length - 1 : selectedRef.current + (key === 'ArrowLeft' ? -1 : 1));
      }
    },
  } : {};

  return <View style={styles.example}>
    <View {...keyboardProps} style={[styles.stage, { height: stageHeight }]} accessible accessibilityRole="adjustable"
      accessibilityLabel="Card price carousel" accessibilityHint="Swipe left or right to explore prices."
      accessibilityValue={{ min: 0, max: cards.length - 1, now: selected, text: `${card.name}, ${money(card.marketPrice.amount)} sample ${currency}. Card ${selected + 1} of ${cards.length}.` }}
      aria-valuemin={0} aria-valuemax={cards.length - 1} aria-valuenow={selected}
      aria-valuetext={`${card.name}, ${money(card.marketPrice.amount)} sample ${currency}. Card ${selected + 1} of ${cards.length}.`}
      accessibilityActions={[{ name: 'increment', label: 'Next card' }, { name: 'decrement', label: 'Previous card' }]}
      onAccessibilityAction={event => goTo(selectedRef.current + (event.nativeEvent.actionName === 'increment' ? 1 : -1))}>
      <View pointerEvents="none" style={[styles.disc, { width: printWidth * 1.28, height: printWidth * 1.28, borderRadius: printWidth }]} />
      <Animated.ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false}
        style={{ width: '100%', ...(Platform.OS === 'web' ? { scrollSnapType: 'x mandatory' } : {}) }}
        contentOffset={{ x: initialIndex * interval, y: 0 }}
        contentContainerStyle={{ paddingHorizontal: (stageWidth - interval) / 2 }}
        snapToInterval={interval} snapToAlignment="start" decelerationRate="fast" disableIntervalMomentum
        directionalLockEnabled bounces={false} onScroll={onScroll} scrollEventThrottle={16}>
        {cards.map((option, index) => {
          const inputRange = [(index - 1) * interval, index * interval, (index + 1) * interval];
          return <View key={option.id} style={{ width: interval, height: stageHeight, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { scrollSnapAlign: 'center' } : {}) }}>
            <Animated.View style={{ transform: [
              { scale: scrollX.interpolate({ inputRange, outputRange: [0.82, 1, 0.82], extrapolate: 'clamp' }) },
              { rotate: scrollX.interpolate({ inputRange, outputRange: ['-10deg', '-4deg', '8deg'], extrapolate: 'clamp' }) },
            ] }}>
              <CardPrint card={option} style={{ width: printWidth }} />
            </Animated.View>
          </View>;
        })}
      </Animated.ScrollView>
    </View>
    <View style={styles.quote}>
      <View style={styles.identity}>
        <Label kind="heading" style={styles.centered}>{card.name}</Label>
        <Label kind="caption" style={styles.metadata}>{card.setName} · {card.collectorNumber}</Label>
      </View>
      <View style={styles.priceRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous price card" disabled={selected === 0} accessibilityState={{ disabled: selected === 0 }} onPress={() => goTo(selected - 1)} style={({ pressed }) => [styles.arrow, (pressed || selected === 0) && { opacity: 0.3 }]}><Icon name="chevron-back" color={colors.primary} /></Pressable>
        <View style={styles.amount} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${card.name}, ${money(card.marketPrice.amount)}. Sample ${currency} price.${card.id === 'base1-4' ? ' First-edition reference image; sample price does not distinguish editions.' : ''}`}>
          <Label kind="price" style={styles.price}>{money(card.marketPrice.amount)}</Label>
          <Label kind="caption" style={styles.metadata}>Sample {currency}</Label>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Next price card" disabled={selected === cards.length - 1} accessibilityState={{ disabled: selected === cards.length - 1 }} onPress={() => goTo(selected + 1)} style={({ pressed }) => [styles.arrow, (pressed || selected === cards.length - 1) && { opacity: 0.3 }]}><Icon name="chevron-forward" color={colors.primary} /></Pressable>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  example: { gap: 14 },
  stage: { marginHorizontal: -24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  disc: { position: 'absolute', backgroundColor: colors.artCool },
  quote: { gap: 10 },
  identity: { alignItems: 'center', gap: 2 },
  centered: { textAlign: 'center' },
  metadata: { color: colors.muted, textAlign: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amount: { flex: 1, alignItems: 'center', gap: 2 },
  price: { fontSize: 36, lineHeight: 44, textAlign: 'center' },
  arrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
});
