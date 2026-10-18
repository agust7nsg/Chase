import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { Badge } from './ui';

export function CurrencyShortcut() {
  const { currency, openCurrencySelector } = useCurrency();
  const [pressed, setPressed] = useState(false);
  return <View style={{ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Badge>{currency}</Badge></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Change currency, ${currency}`} onPress={openCurrencySelector}
      onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} style={styles.touchTarget} />
  </View>;
}

const styles = StyleSheet.create({
  // Expand the touch target without changing the existing badge's visible size or layout.
  touchTarget: { position: 'absolute', left: -4, right: -4, top: -10, bottom: -10, borderRadius: 8 },
});
