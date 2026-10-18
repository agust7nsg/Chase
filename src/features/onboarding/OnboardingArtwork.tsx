import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { CardPrint } from '@/components/CardPrint';
import { Icon, Label, uiStyles } from '@/components/ui';
import { getCatalogCard } from '@/data/mocks/catalog';
import { getHistoryChange, getPortfolioHistory, type HistoryPoint } from '@/services/priceHistory';
import { colors } from '@/theme/tokens';

import { PriceCarousel } from './PriceCarousel';
const collectionCards = [getCatalogCard('swsh7-192')!, getCatalogCard('swshp-053')!];
const exampleItems = collectionCards.map((card) => ({ cardId: card.id, quantity: 1, addedAt: '2026-10-01T00:00:00.000Z' }));
const exampleHistory = getPortfolioHistory(exampleItems, '1M');
const exampleChange = getHistoryChange(exampleHistory);

/** These visual examples never change ownership or consume a recognition. */
export function OnboardingArtwork({ step }: { step: 0 | 1 | 2 | 3 }) {
  if (step === 0) return <PriceCarousel />;
  if (step === 1) return <ScanExample />;
  if (step === 2) return <CollectionExample />;
  return <TrialExample />;
}

function ScanExample() {
  const { formatMoney: usd } = useCurrency();
  const card = getCatalogCard('swsh7-192')!;
  const { width } = useWindowDimensions();
  const printWidth = Math.min(182, (width - 104) * 0.76);
  return <View style={[styles.viewfinder, { height: printWidth * 825 / 600 + 110 }]}>
    <View pointerEvents="none" style={styles.scannerOrbit} />
    <View pointerEvents="none" style={styles.scannerInnerOrbit} />
    <View style={styles.demoTag}><Icon name="scan-outline" size={16} color={colors.white} /><Label kind="caption" style={{ color: colors.onPrimaryMuted }}>Demo scan</Label></View>
    <View style={[styles.scanTarget, { width: printWidth + 24 }]}>
      <CardPrint card={card} style={{ ...styles.heroPrint, width: printWidth }} />
      <View pointerEvents="none" style={[styles.corner, styles.topLeft]} /><View pointerEvents="none" style={[styles.corner, styles.topRight]} />
      <View pointerEvents="none" style={[styles.corner, styles.bottomLeft]} /><View pointerEvents="none" style={[styles.corner, styles.bottomRight]} />
    </View>
    <View style={styles.recognitionResult}>
      <View style={styles.checkmark}><Icon name="checkmark" size={17} color={colors.primaryDeep} /></View>
      <Label style={{ ...styles.cardName, flex: 1 }}>Dragonite V</Label>
      <Label style={styles.resultPrice}>{usd(card.marketPrice.amount)}</Label>
    </View>
  </View>;
}

function CollectionExample() {
  const { currency, formatMoney: usd } = useCurrency();
  const value = exampleHistory[exampleHistory.length - 1].value;
  const sign = exampleChange.amount >= 0 ? '+' : '−';
  const { height, width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const largeText = fontScale > 1.3;
  const compact = height < 740 && !largeText;
  const mewSize = Math.min(163, (width - 48) * 0.42);
  return <View style={[styles.artwork, compact && { gap: 14 }]}>
    <View style={[styles.collectionQuote, compact && { minHeight: 126 }, largeText && { paddingTop: 156 }]}>
      <View pointerEvents="none" style={[styles.mewDisc, { width: mewSize * 0.8, height: mewSize * 0.8, borderRadius: mewSize * 0.4 }]} />
      <Image source={require('../../../assets/cards/mew.png')} contentFit="contain" cachePolicy="memory-disk"
        style={[styles.mew, { width: mewSize, height: mewSize }]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      <View style={styles.collectionNumbers}>
        <Label kind="caption" style={uiStyles.muted}>Sample {currency} value</Label>
        <Label kind="price" style={styles.collectionValue}>{usd(value)}</Label>
        <View style={[uiStyles.row, { gap: 4 }]}>
          <Icon name={exampleChange.amount >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={17} color={exampleChange.amount < 0 ? colors.danger : colors.success} />
          <Label kind="caption" style={{ color: exampleChange.amount < 0 ? colors.danger : colors.success, fontWeight: '600' }}>{sign}{Math.abs(exampleChange.percent).toFixed(2)}% · 1M</Label>
        </View>
      </View>
    </View>
    <IllustrativeTrend points={exampleHistory} />
    <View style={[styles.exampleHoldings, stacked && { flexDirection: 'column' }]}>
      {collectionCards.map((card) => <View key={card.id} style={styles.holding}>
        <CardPrint card={card} style={{ width: stacked ? 60 : 64, ...styles.holdingPrint }} />
        <View style={{ flex: 1, gap: 4 }}><Label kind="caption" style={styles.cardName}>{card.name}</Label><Label style={styles.holdingPrice}>{usd(card.marketPrice.amount)}</Label></View>
      </View>)}
    </View>
  </View>;
}

function IllustrativeTrend({ points }: { points: HistoryPoint[] }) {
  const { currency, formatMoney: usd } = useCurrency();
  const [width, setWidth] = useState(0);
  const height = 84;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const span = max - min || 1;
  const coordinates = points.map((point, index) => ({ x: index / (points.length - 1) * width, y: 8 + (1 - (point.value - min) / span) * (height - 16) }));
  return <View style={{ gap: 10 }} accessible accessibilityRole="image" accessibilityLabel={`Sample monthly ${currency} history of two example copies: ${usd(points[0].value)} at the start, ${usd(points[points.length - 1].value)} at the end. No cards have been added.`}>
    <View onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)} style={{ height }}>
      {[0, 0.5, 1].map((position) => <View key={position} style={[styles.chartGuide, { top: position * height }]} />)}
      {width > 0 ? coordinates.slice(1).map((point, index) => {
        const previous = coordinates[index];
        const length = Math.hypot(point.x - previous.x, point.y - previous.y);
        const angle = Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI;
        return <View key={index} style={[styles.chartSegment, { width: length + 0.5, left: (point.x + previous.x) / 2 - length / 2, top: (point.y + previous.y) / 2 - 1.5, transform: [{ rotate: `${angle}deg` }] }]} />;
      }) : null}
      {width > 0 ? <View style={[styles.chartEndpoint, { left: width - 4, top: coordinates[coordinates.length - 1].y - 4 }]} /> : null}
    </View>
    <View style={uiStyles.between}><Label kind="caption" style={uiStyles.muted}>Sep 1</Label><Label kind="caption" style={uiStyles.muted}>Oct 1</Label></View>
  </View>;
}

function TrialExample() {
  const card = getCatalogCard('swsh7-218')!;
  const { width } = useWindowDimensions();
  const printWidth = Math.min(180, width * 0.5);
  return <View style={[styles.trialExample, { height: printWidth * 825 / 600 + 64 }]}>
    <View pointerEvents="none" style={styles.trialDisc} />
    <View style={{ transform: [{ rotate: '6deg' }] }}><CardPrint card={card} style={{ ...styles.heroPrint, width: printWidth }} /></View>
    <View style={styles.trialIcon}><Icon name="scan-outline" size={28} color={colors.white} /></View>
  </View>;
}

const styles = StyleSheet.create({
  artwork: { gap: 18, width: '100%' },
  heroPrint: { shadowColor: colors.text, shadowOpacity: 0.16, shadowOffset: { width: 0, height: 10 }, shadowRadius: 16 },
  cardName: { fontWeight: '600' },
  viewfinder: { backgroundColor: colors.scanner, borderRadius: 26, alignItems: 'center', paddingTop: 32, overflow: 'hidden' },
  scannerOrbit: { position: 'absolute', width: 340, height: 340, borderRadius: 170, borderWidth: 1, borderColor: colors.scannerOrbitLine, top: 2 },
  scannerInnerOrbit: { position: 'absolute', width: 270, height: 270, borderRadius: 135, borderWidth: 1, borderColor: colors.scannerOrbitLine, top: 37 },
  demoTag: { position: 'absolute', top: 14, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  scanTarget: { padding: 12 },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: colors.scannerFrame },
  topLeft: { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2, borderTopLeftRadius: 8 },
  topRight: { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2, borderTopRightRadius: 8 },
  bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2, borderBottomLeftRadius: 8 },
  bottomRight: { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2, borderBottomRightRadius: 8 },
  recognitionResult: { position: 'absolute', bottom: 14, left: 14, right: 14, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  checkmark: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  resultPrice: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  collectionQuote: { minHeight: 146, justifyContent: 'center', position: 'relative' },
  collectionNumbers: { gap: 4, alignItems: 'flex-start' },
  collectionValue: { fontSize: 42, lineHeight: 50 },
  mewDisc: { position: 'absolute', right: 2, top: 8, backgroundColor: colors.mewSoft },
  mew: { position: 'absolute', right: -9, top: -8, width: 163, height: 163 },
  chartGuide: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  chartSegment: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: colors.primary },
  chartEndpoint: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, borderColor: colors.white, borderWidth: 1 },
  exampleHoldings: { flexDirection: 'row', gap: 16, paddingTop: 8 },
  holding: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  holdingPrint: { shadowColor: colors.text, shadowOpacity: 0.08, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 },
  holdingPrice: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  trialExample: { alignItems: 'center', justifyContent: 'center' },
  trialDisc: { position: 'absolute', width: 270, height: 270, borderRadius: 135, backgroundColor: colors.primarySoft },
  trialIcon: { position: 'absolute', right: 30, bottom: 30, width: 58, height: 58, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: colors.background },
});
