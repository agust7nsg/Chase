import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { CardPrint } from '@/components/CardPrint';
import { Icon, Label, uiStyles } from '@/components/ui';
import { getCatalogCard } from '@/data/mocks/catalog';
import { getHistoryChange, getPortfolioHistory, type HistoryPoint } from '@/services/priceHistory';
import { colors } from '@/theme/tokens';

const priceCards = [getCatalogCard('base1-4')!, getCatalogCard('swsh7-215')!];
const exampleItems = priceCards.map((card) => ({ cardId: card.id, quantity: 1, addedAt: '2026-10-01T00:00:00.000Z' }));
const exampleHistory = getPortfolioHistory(exampleItems, '1M');
const exampleChange = getHistoryChange(exampleHistory);
const usd = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Intro examples only: neither selecting a printing nor viewing a chart changes ownership or trial use. */
export function OnboardingArtwork({ step }: { step: 0 | 1 | 2 | 3 }) {
  if (step === 0) return <PriceExample />;
  if (step === 1) return <ScanExample />;
  if (step === 2) return <CollectionExample />;
  return <TrialExample />;
}

function PriceExample() {
  const [selected, setSelected] = useState(0);
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 740 && fontScale <= 1.2;
  const card = priceCards[selected];
  return <View style={styles.artwork}>
    {compact ? <View style={styles.compactQuote}>
      <CardPrint card={card} style={{ width: 84 }} />
      <View style={{ flex: 1, gap: 4 }}><Label style={{ fontWeight: '700' }}>{card.name}</Label><Label kind="caption" style={uiStyles.muted}>{card.setName} · {card.collectorNumber}</Label><Label kind="price" style={styles.compactValue}>{usd(card.marketPrice.amount)}</Label><Label kind="caption" style={{ color: colors.primaryDeep }}>Sample estimate · USD</Label></View>
    </View> : <View style={styles.printStage}>
      {fontScale <= 1.2 ? <View style={styles.editionRail} accessible={false}>
        <Label kind="caption" style={styles.railText}>TCG</Label>
        <Label kind="caption" style={styles.railText}>{card.collectorNumber}</Label>
      </View> : null}
      <CardPrint card={card} style={styles.pricePrint} />
      {fontScale <= 1.2 ? <View style={styles.stageCaption}><Label kind="caption" style={{ color: colors.primaryDeep }}>{card.variant}</Label><View style={styles.captionLine} /></View> : null}
    </View>}
    <View style={styles.cardChoices}>
      {priceCards.map((option, index) => <Pressable key={option.id} accessibilityRole="button"
        accessibilityLabel={`Preview ${option.name} price`} accessibilityState={{ selected: selected === index }}
        onPress={() => setSelected(index)} style={({ pressed }) => [styles.cardChoice, selected === index && styles.cardChoiceSelected, pressed && { opacity: 0.65 }]}>
        <Label kind="caption" style={{ color: selected === index ? colors.primaryDeep : colors.muted, fontWeight: selected === index ? '700' : '500' }}>{option.name}</Label>
      </Pressable>)}
    </View>
    {compact ? <Label kind="caption" style={uiStyles.muted}>{selected === 0 ? 'First-edition image; estimate is not edition-specific.' : 'Printing, finish and condition affect the estimate.'}</Label> : <View style={styles.priceQuote} accessibilityLiveRegion="polite">
      <View style={uiStyles.between}><Label style={{ fontWeight: '600' }}>{card.setName}</Label><Label kind="caption" style={uiStyles.muted}>Sample estimate · USD</Label></View>
      <Label kind="price" style={styles.quoteValue}>{usd(card.marketPrice.amount)}</Label>
      <Label kind="caption" style={uiStyles.muted}>{selected === 0 ? 'First-edition image; estimate is not edition-specific.' : 'Printing, finish and condition affect the estimate.'}</Label>
    </View>}
  </View>;
}

function ScanExample() {
  const card = getCatalogCard('swsh12-186')!;
  return <View style={styles.artwork}>
    <View style={styles.viewfinder}>
      <View style={styles.viewfinderHeader}><Icon name="scan-outline" size={18} color={colors.white} /><Label kind="caption" style={{ color: colors.onPrimaryMuted }}>Sample scan preview</Label></View>
      <View style={styles.scanTarget}>
        <CardPrint card={card} style={styles.scanPrint} />
        <View pointerEvents="none" style={[styles.corner, styles.topLeft]} /><View pointerEvents="none" style={[styles.corner, styles.topRight]} />
        <View pointerEvents="none" style={[styles.corner, styles.bottomLeft]} /><View pointerEvents="none" style={[styles.corner, styles.bottomRight]} />
      </View>
      <View style={styles.viewfinderFooter}><View style={styles.statusDot} /><Label kind="caption" style={{ color: colors.onPrimaryMuted }}>Entire card inside the frame</Label></View>
    </View>
    <View style={styles.recognitionResult}>
      <View style={styles.checkmark}><Icon name="checkmark" size={20} color={colors.success} /></View>
      <View style={{ flex: 1, gap: 3 }}><Label style={{ fontWeight: '700' }}>Lugia V</Label><Label kind="caption" style={uiStyles.muted}>Silver Tempest · 186/195 · Holo</Label></View>
      <Label kind="caption" style={{ color: colors.primaryDeep, fontWeight: '600' }}>Identified</Label>
    </View>
    <View style={styles.scanSteps}>{['Identify', 'Review price', 'Save a copy'].map((label, index) => <View key={label} style={styles.scanStep}>
      <Label kind="caption" style={{ color: colors.primary, fontWeight: '700' }}>0{index + 1}</Label><Label kind="caption" style={uiStyles.muted}>{label}</Label>
    </View>)}</View>
  </View>;
}

function CollectionExample() {
  const value = exampleHistory[exampleHistory.length - 1].value;
  const sign = exampleChange.amount >= 0 ? '+' : '−';
  return <View style={[styles.artwork, styles.collectionExample]}>
    <View style={uiStyles.between}><Label kind="eyebrow" style={uiStyles.muted}>EXAMPLE COLLECTION</Label><Label kind="caption" style={uiStyles.muted}>2 cards · 2 copies</Label></View>
    <View style={{ gap: 4 }}><Label kind="caption" style={uiStyles.muted}>Estimated value · USD</Label><Label kind="price" style={styles.collectionValue}>{usd(value)}</Label>
      <View style={[uiStyles.row, { gap: 5 }]}><Icon name={exampleChange.amount >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={18} color={exampleChange.amount < 0 ? colors.danger : colors.success} /><Label kind="caption" style={{ color: exampleChange.amount < 0 ? colors.danger : colors.success, fontWeight: '600' }}>{sign}{usd(Math.abs(exampleChange.amount))} ({sign}{Math.abs(exampleChange.percent).toFixed(2)}%) · 1 month</Label></View>
    </View>
    <IllustrativeTrend points={exampleHistory} />
    <View style={styles.exampleHoldings}>{priceCards.map((card) => <View key={card.id} style={styles.holding}>
      <CardPrint card={card} style={{ width: 32 }} /><View style={{ flex: 1, gap: 2 }}><Label kind="caption" style={{ fontWeight: '700' }}>{card.name}</Label><Label kind="caption" style={uiStyles.muted}>1 copy · {card.collectorNumber}</Label></View><Label style={styles.holdingPrice}>{usd(card.marketPrice.amount)}</Label>
    </View>)}</View>
    <Label kind="caption" style={uiStyles.muted}>Illustrative history of these copies. No cards have been added.</Label>
  </View>;
}

function IllustrativeTrend({ points }: { points: HistoryPoint[] }) {
  const [width, setWidth] = useState(0);
  const height = 82;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const span = max - min || 1;
  const coordinates = points.map((point, index) => ({ x: index / (points.length - 1) * width, y: 8 + (1 - (point.value - min) / span) * (height - 16) }));
  return <View style={{ gap: 8 }} accessible accessibilityRole="image" accessibilityLabel={`Illustrative monthly collection values: ${usd(points[0].value)} at the start, ${usd(points[points.length - 1].value)} at the end. Not live market data.`}>
    <View onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)} style={{ height }}>
      {[0, 0.5, 1].map((position) => <View key={position} style={[styles.chartGuide, { top: position * height }]} />)}
      {width > 0 ? coordinates.slice(1).map((point, index) => {
        const previous = coordinates[index];
        const length = Math.hypot(point.x - previous.x, point.y - previous.y);
        const angle = Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI;
        return <View key={index} style={[styles.chartSegment, { width: length + 0.5, left: (point.x + previous.x) / 2 - length / 2, top: (point.y + previous.y) / 2 - 1.25, transform: [{ rotate: `${angle}deg` }] }]} />;
      }) : null}
    </View>
    <View style={uiStyles.between}><Label kind="caption" style={uiStyles.muted}>Sep 1</Label><Label kind="caption" style={uiStyles.muted}>Oct 1 · sample</Label></View>
  </View>;
}

function TrialExample() {
  const card = getCatalogCard('swsh7-192')!;
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  return <View style={[styles.trialExample, stacked && { flexDirection: 'column' }]}>
    <View style={styles.trialPrint}><CardPrint card={card} style={{ width: 120 }} /></View>
    <View style={{ flex: stacked ? undefined : 1, gap: 12 }}><View style={styles.trialIcon}><Icon name="scan-outline" size={24} color={colors.primaryDeep} /></View><Label kind="heading">One free scan</Label><Label kind="caption" style={uiStyles.muted}>Review the result before adding a copy.</Label></View>
  </View>;
}

const styles = StyleSheet.create({
  artwork: { gap: 16, width: '100%' },
  printStage: { backgroundColor: colors.primarySoft, minHeight: 232, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 54, borderRadius: 4, position: 'relative' },
  pricePrint: { width: 146, shadowColor: colors.text, shadowOpacity: 0.16, shadowOffset: { width: 0, height: 8 }, shadowRadius: 12 },
  editionRail: { position: 'absolute', left: 12, top: 16, bottom: 16, justifyContent: 'space-between' },
  railText: { color: colors.primaryDeep, fontWeight: '500', maxWidth: 48 },
  stageCaption: { position: 'absolute', right: 12, bottom: 20, alignItems: 'flex-end', gap: 8 },
  captionLine: { width: 24, height: 2, backgroundColor: colors.primary },
  cardChoices: { flexDirection: 'row', gap: 8 },
  cardChoice: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 8, borderBottomColor: colors.border, borderBottomWidth: 1 },
  cardChoiceSelected: { borderBottomColor: colors.primary, borderBottomWidth: 2 },
  priceQuote: { gap: 4, paddingBottom: 16, borderBottomColor: colors.border, borderBottomWidth: 1 },
  quoteValue: { fontSize: 36, lineHeight: 44 },
  compactQuote: { backgroundColor: colors.primarySoft, flexDirection: 'row', gap: 20, padding: 16, alignItems: 'center', borderRadius: 4 },
  compactValue: { fontSize: 28, lineHeight: 36 },
  viewfinder: { backgroundColor: colors.scanner, borderRadius: 16, alignItems: 'center', gap: 16, padding: 16 },
  viewfinderHeader: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8 },
  scanTarget: { width: 174, padding: 10 },
  scanPrint: { width: 154 },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: colors.white },
  topLeft: { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2, borderTopLeftRadius: 5 },
  topRight: { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2, borderTopRightRadius: 5 },
  bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2, borderBottomLeftRadius: 5 },
  bottomRight: { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2, borderBottomRightRadius: 5 },
  viewfinderFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.onPrimaryMuted },
  recognitionResult: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingVertical: 4 },
  checkmark: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.subtle, alignItems: 'center', justifyContent: 'center' },
  scanSteps: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  scanStep: { flex: 1, gap: 4 },
  collectionExample: { paddingTop: 16, borderTopColor: colors.border, borderTopWidth: 1, gap: 20 },
  collectionValue: { fontSize: 44, lineHeight: 52 },
  chartGuide: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  chartSegment: { position: 'absolute', height: 2.5, borderRadius: 2, backgroundColor: colors.primary },
  exampleHoldings: { borderTopWidth: 1, borderTopColor: colors.border },
  holding: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  holdingPrice: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  trialExample: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  trialPrint: { backgroundColor: colors.primarySoft, padding: 12, borderRadius: 4 },
  trialIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
