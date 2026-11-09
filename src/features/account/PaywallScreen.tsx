import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BackHandler, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChaseBrand } from '@/components/ChaseBrand';
import { Button, Icon, Label } from '@/components/ui';
import { CardPrint } from '@/components/CardPrint';
import { getLegacyCard } from '@/data/mocks/catalog';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';
import { useCurrency } from '@/features/currency/CurrencyProvider';

const showcase = [
  { position: 'left', card: getLegacyCard('base1-4')! },
  { position: 'center', card: getLegacyCard('swsh7-215')! },
  { position: 'right', card: getLegacyCard('sv6-214')! },
] as const;

/** Bundled editorial artwork: never requests a quote, consumes a scan or changes ownership. */
function ProCardHero() {
  const { width } = useWindowDimensions();
  const { currency, formatMoney } = useCurrency();
  const [availableWidth, setAvailableWidth] = useState(Math.min(width - 48, 400));
  const stageWidth = Math.min(availableWidth, 400);
  const centerWidth = stageWidth * 0.46;
  const sideWidth = stageWidth * 0.36;
  const cardHeight = centerWidth * 825 / 600;
  return <View testID="pro-card-hero" style={styles.hero} onLayout={event => setAvailableWidth(event.nativeEvent.layout.width)}>
    <View style={{ width: stageWidth, height: cardHeight + 72 }}>
      {showcase.map(({ position, card }) => {
        const centered = position === 'center';
        const left = centered ? (stageWidth - centerWidth) / 2 : position === 'left' ? stageWidth * 0.02 : stageWidth * 0.62;
        return <View key={position} testID={`pro-card-${position}`} style={[styles.card, {
          width: centered ? centerWidth : sideWidth, left,
          top: centered ? 0 : (centerWidth - sideWidth) * 825 / 600,
          zIndex: centered ? 3 : 1,
          transform: [{ rotate: centered ? '0deg' : position === 'left' ? '-12deg' : '12deg' }],
        }]}><CardPrint card={card} /></View>;
      })}
      <View style={[styles.priceRow, { top: cardHeight + 24 }]}>
        {showcase.map(({ position, card }) => <View key={position} style={[styles.priceColumn, position === 'center' && { flex: 1.2 }]}>
          <View testID={`pro-price-${position}`} style={[styles.priceBadge, position === 'center' && styles.centerPrice]}>
            <Label maxFontSizeMultiplier={1.2} accessibilityLabel={`${card.name}, illustrative value ${formatMoney(card.marketPrice!.amount, card.marketPrice!.currency)} ${currency}`}
              style={[styles.cardPrice, position === 'center' && styles.centerPriceText]}>{formatMoney(card.marketPrice!.amount, card.marketPrice!.currency)}</Label>
          </View>
        </View>)}
      </View>
    </View>
    <Label kind="caption" style={styles.illustrationNote}>Illustrative values · {currency}</Label>
  </View>;
}

export default function PaywallScreen() {
  const { completeOnboarding } = useChase();
  const { width } = useWindowDimensions();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [purchaseNotice, setPurchaseNotice] = useState(false);
  const close = useCallback(() => {
    if (returnTo === 'scanner' || returnTo === 'organize') { if (router.canGoBack()) router.back(); else router.replace(returnTo === 'scanner' ? '/scanner' : '/organize'); }
    else { void completeOnboarding().then(() => router.replace('/(tabs)')).catch(() => {}); }
  }, [completeOnboarding, returnTo]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => subscription.remove();
  }, [close]));
  const openAccount = (section: 'restore' | 'terms' | 'privacy') => router.push({ pathname: '/account', params: { section } });

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
    <View style={styles.header}>
      <View style={styles.brand} accessible accessibilityLabel="Chase Pro">
        <ChaseBrand /><View style={styles.proBadge}><Label style={styles.proText}>PRO</Label></View>
      </View>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={returnTo ? 'Close Chase Pro and return' : 'Close Chase Pro and go to Home'} style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}><Icon name="close" size={24} /></Pressable>
    </View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.pitch}>
        <Label accessibilityRole="header" style={[styles.headline, width < 360 && styles.compactHeadline]}>{'Know what every\npull is worth.'}</Label>
        <Label style={styles.subtitle}>Keep scanning. Find your next chase.</Label>
      </View>
      <ProCardHero />
      <View testID="pro-benefits" style={styles.benefits}>
        <View style={styles.benefit}><Icon name="scan-outline" color={colors.primary} size={21} /><Label style={styles.benefitText}>Keep scanning, pack after pack.</Label></View>
        <View style={styles.benefit}><Icon name="layers-outline" color={colors.primary} size={21} /><Label style={styles.benefitText}>Save beyond the 50-card limit.</Label></View>
      </View>
      <View style={styles.actions}>
        <Button title="Get Chase Pro" icon="arrow-forward-outline" onPress={() => setPurchaseNotice(true)} />
        <Button title="Continue with Free" variant="ghost" onPress={close} />
        <View style={styles.links}>
          <Pressable accessibilityRole="button" accessibilityLabel="Restore purchases" onPress={() => openAccount('restore')} style={styles.link}><Label kind="caption" style={styles.linkText}>Restore purchases</Label></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Terms" onPress={() => openAccount('terms')} style={styles.link}><Label kind="caption" style={styles.linkText}>Terms</Label></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Privacy" onPress={() => openAccount('privacy')} style={styles.link}><Label kind="caption" style={styles.linkText}>Privacy</Label></Pressable>
        </View>
      </View>
    </ScrollView>
    <Modal visible={purchaseNotice} transparent animationType="none" onRequestClose={() => setPurchaseNotice(false)}>
      <View style={styles.scrim}>
        <View role="dialog" accessibilityLabel="Chase Pro" accessibilityViewIsModal style={styles.notice}>
          <Label kind="heading" accessibilityRole="header">Chase Pro</Label>
          <Label style={styles.noticeText}>Subscriptions are currently unavailable. Please try again later. No payment has been taken.</Label>
          <Button title="Got it" onPress={() => setPurchaseNotice(false)} />
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingLeft: 24, paddingRight: 12, minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proBadge: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 2 },
  proText: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 1, color: colors.white },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8, gap: 24 },
  pitch: { alignItems: 'center', gap: 10 },
  headline: { fontSize: 36, lineHeight: 41, letterSpacing: -1.2, fontWeight: '800', textAlign: 'center' },
  compactHeadline: { fontSize: 32, lineHeight: 38 },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: colors.muted },
  hero: { width: '100%', alignItems: 'center', paddingTop: 6, gap: 6 },
  card: { position: 'absolute', borderRadius: 10, backgroundColor: colors.surface, shadowColor: colors.heroInk, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  priceRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 4 },
  priceColumn: { flex: 1, alignItems: 'center' },
  priceBadge: { backgroundColor: colors.scanner, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 7 },
  centerPrice: { paddingHorizontal: 10, paddingVertical: 9 },
  cardPrice: { color: colors.scannerPrice, fontSize: 14, lineHeight: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  centerPriceText: { fontSize: 17, lineHeight: 22 },
  illustrationNote: { color: colors.muted, textAlign: 'center', fontSize: 12, lineHeight: 18 },
  benefits: { alignSelf: 'center', gap: 14, paddingVertical: 2 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitText: { fontSize: 15, lineHeight: 22, fontWeight: '600', flexShrink: 1 },
  actions: { gap: 0, marginTop: 'auto', paddingTop: 2 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 12 },
  link: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  linkText: { color: colors.muted, fontSize: 12 },
  scrim: { flex: 1, backgroundColor: colors.scrim, padding: 24, alignItems: 'center', justifyContent: 'center' },
  notice: { backgroundColor: colors.surface, width: '100%', maxWidth: 380, padding: 24, borderRadius: 20, gap: 16 },
  noticeText: { color: colors.muted },
});
