import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CardPrint } from '@/components/CardPrint';
import { money } from '@/components/CardRow';
import { PriceChart, RangeSelector, historyDate } from '@/components/PriceChart';
import { Badge, Button, EmptyState, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useChase } from '@/features/app/ChaseProvider';
import { summarizeCollection } from '@/services/domain';
import { getHistoryChange, getHoldingMovers, getPortfolioHistory, HISTORY_AS_OF, type HistoryRange, type HoldingMover } from '@/services/priceHistory';
import { colors } from '@/theme/tokens';
import type { CollectionItem } from '@/types/domain';

const exampleItems: CollectionItem[] = ['base1-4', 'swsh7-215', 'swsh11-186', 'sv2-203'].map(cardId => ({ cardId, quantity: 1, addedAt: HISTORY_AS_OF }));
const sign = (value: number) => value > 0 ? '+' : value < 0 ? '−' : '';
const signedMoney = (value: number) => `${sign(value)}${money(Math.abs(value))}`;

function PositionRow({ item, total, allocation = false }: { item: HoldingMover; total: number; allocation?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.card.name}, ${item.card.variant}, ${item.quantity} copies`} onPress={() => router.push({ pathname: '/card/[id]', params: { id: item.card.id } })} style={({ pressed }) => [styles.position, pressed && { opacity: 0.6 }]}>
    <View style={{ width: 40 }}><CardPrint card={item.card} /></View>
    <View style={{ flex: 1, gap: 4, minWidth: 80 }}><Label style={{ fontWeight: '600' }}>{item.card.name}</Label><Label kind="caption" style={uiStyles.muted}>{item.quantity} {item.quantity === 1 ? 'copy' : 'copies'} · {item.card.collectorNumber}</Label>{allocation ? <View style={styles.allocationTrack}><View style={[styles.allocationFill, { width: `${total ? item.value / total * 100 : 0}%` }]} /></View> : null}</View>
    <View style={{ alignItems: 'flex-end', gap: 4 }}><Label style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(item.value)}</Label><Label kind="caption" style={{ color: allocation ? colors.muted : item.changeAmount < 0 ? colors.danger : item.changeAmount > 0 ? colors.success : colors.muted, fontVariant: ['tabular-nums'] }}>{allocation ? `${total ? (item.value / total * 100).toFixed(1) : '0'}% of value` : `${sign(item.changePercent)}${Math.abs(item.changePercent).toFixed(2)}%`}</Label></View>
  </Pressable>;
}

export function CollectionScreen() {
  const { state, summary, entitlements, ready, loadError, retryLoad, persistenceError } = useChase();
  const [range, setRange] = useState<HistoryRange>('1M');
  const [view, setView] = useState<'holdings' | 'allocation'>('holdings');
  const [order, setOrder] = useState<'value' | 'change'>('value');
  const [preview, setPreview] = useState(false);
  const [explain, setExplain] = useState(false);
  const items = preview ? exampleItems : state.items;
  const displayedSummary = preview ? summarizeCollection(exampleItems) : summary;
  const history = useMemo(() => getPortfolioHistory(items, range), [items, range]);
  const change = getHistoryChange(history);
  const movers = useMemo(() => getHoldingMovers(items, range), [items, range]);
  const positions = [...movers].sort((a, b) => order === 'value' || view === 'allocation' ? b.value - a.value : Math.abs(b.changeAmount) - Math.abs(a.changeAmount));
  const setAllocation = useMemo(() => {
    const sets = new Map<string, { value: number; copies: number }>();
    for (const item of items) {
      const card = getCatalogCard(item.cardId); if (!card) continue;
      const previous = sets.get(card.setName) ?? { value: 0, copies: 0 };
      sets.set(card.setName, { value: previous.value + Math.round(card.marketPrice.amount * 100) * item.quantity, copies: previous.copies + item.quantity });
    }
    return [...sets.entries()].sort((a, b) => b[1].value - a[1].value);
  }, [items]);
  if (!ready) return <Screen>{loadError ? <EmptyState title="Collection unavailable" message={loadError} action="Try again" onPress={retryLoad} icon="cloud-offline-outline" /> : <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Label>Loading your collection…</Label></View>}</Screen>;
  return <Screen style={{ gap: 24 }}>
    <View style={uiStyles.between}><View style={uiStyles.row}><View style={styles.walletIcon}><Icon name="wallet-outline" color={colors.primary} size={22} /></View><Label kind="title" accessibilityRole="header">Collection</Label></View><Badge tone="neutral">USD</Badge></View>
    {preview ? <View style={styles.preview}><Icon name="information-circle-outline" color={colors.primary} /><Label kind="caption" style={{ flex: 1 }}>Sample wallet preview. Your saved cards are unchanged.</Label><Pressable accessibilityRole="button" accessibilityLabel="Return to my collection" onPress={() => setPreview(false)} style={styles.closePreview}><Icon name="close" size={22} color={colors.primary} /></Pressable></View> : null}
    <View style={{ gap: 10 }}>
      <View style={uiStyles.between}><Label kind="caption" style={uiStyles.muted}>Estimated collection value</Label><Label kind="caption" style={uiStyles.muted}>Sample USD</Label></View>
      <Label kind="price" style={styles.balance}>{money(displayedSummary.totalValue)}</Label>
      {displayedSummary.totalCopies > 0 ? <><View style={[uiStyles.row, { gap: 6, flexWrap: 'wrap' }]}><Icon name={change.amount < 0 ? 'trending-down-outline' : change.amount > 0 ? 'trending-up-outline' : 'remove-outline'} color={change.amount < 0 ? colors.danger : change.amount > 0 ? colors.success : colors.muted} size={18} /><Label style={{ color: change.amount < 0 ? colors.danger : change.amount > 0 ? colors.success : colors.muted, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{signedMoney(change.amount)} ({sign(change.percent)}{Math.abs(change.percent).toFixed(2)}%)</Label><Label kind="caption" style={uiStyles.muted}>{range} sample price change</Label></View>
      <PriceChart points={history} height={172} label="Collection value history" color={displayedSummary.totalCopies ? colors.primary : colors.border} />
      <RangeSelector value={range} onChange={setRange} label="Collection history range" />
      <View style={styles.historyNote}><Label kind="caption" style={[uiStyles.muted, { flex: 1 }]}>Simulated prices · current quantities</Label><Pressable accessibilityRole="button" accessibilityLabel="How collection history is calculated" accessibilityState={{ expanded: explain }} aria-expanded={explain} onPress={() => setExplain(!explain)} style={styles.method}><Icon name="information-circle-outline" size={19} color={colors.muted} /></Pressable></View>
      {explain ? <View style={styles.explanation}><Label kind="caption" style={uiStyles.muted}>Each point values your current copies at simulated earlier prices. Adding copies recalculates the whole curve. This is price movement, not profit, purchases or your actual past balance. Samples end {historyDate(HISTORY_AS_OF, true)}; no live market feed is connected.</Label></View> : null}</> : <Label kind="caption" style={uiStyles.muted}>Your saved cards will determine the value and price history shown here.</Label>}
    </View>
    {displayedSummary.totalCopies > 0 ? <><View style={styles.summary}>
      <View style={{ flex: 1, gap: 3 }}><Label kind="heading" style={styles.stat}>{displayedSummary.uniqueCards}</Label><Label kind="caption" style={uiStyles.muted}>Unique printings</Label></View>
      <View style={{ flex: 1, gap: 3 }}><Label kind="heading" style={styles.stat}>{displayedSummary.totalCopies}</Label><Label kind="caption" style={uiStyles.muted}>Total copies</Label></View>
      <View style={{ flex: 1, gap: 3 }}><Label kind="heading" style={styles.stat}>{setAllocation.length}</Label><Label kind="caption" style={uiStyles.muted}>Sets</Label></View>
    </View>
    <Button title="My Cards" icon="albums-outline" onPress={() => router.push('/my-cards')} /></> : null}
    {summary.totalCopies === 0 && !preview ? <View style={{ gap: 16, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border }}><Label kind="heading">Your collection starts here</Label><Label style={uiStyles.muted}>Add a printing to see its value, movement and share of your collection.</Label><Button title="Browse cards" icon="search-outline" onPress={() => router.push('/search')} /><Button title="Preview sample wallet" variant="secondary" icon="pulse-outline" onPress={() => setPreview(true)} /><Button title="My Cards" variant="ghost" icon="albums-outline" onPress={() => router.push('/my-cards')} /></View> : <View style={{ gap: 12 }}>
      <View style={styles.viewTabs}>
        {(['holdings', 'allocation'] as const).map(option => <Pressable key={option} accessibilityRole="tab" accessibilityLabel={option === 'holdings' ? 'Holdings' : 'Allocation'} accessibilityState={{ selected: view === option }} onPress={() => setView(option)} style={[styles.viewTab, view === option && styles.activeTab]}><Label style={{ color: view === option ? colors.text : colors.muted, fontWeight: view === option ? '700' : '500' }}>{option === 'holdings' ? 'Holdings' : 'Allocation'}</Label></Pressable>)}
      </View>
      {view === 'holdings' ? <View style={uiStyles.between}><Label kind="caption" style={uiStyles.muted}>Position value · {range} price change</Label><Pressable accessibilityRole="button" accessibilityLabel={order === 'value' ? 'Sort holdings by price movement' : 'Sort holdings by value'} onPress={() => setOrder(order === 'value' ? 'change' : 'value')} style={styles.sort}><Icon name="swap-vertical-outline" size={16} color={colors.primary} /><Label kind="caption" style={{ color: colors.primary }}>{order === 'value' ? 'Value' : 'Movement'}</Label></Pressable></View> : <Label kind="caption" style={uiStyles.muted}>How your estimated value is distributed.</Label>}
      {positions.map(item => <PositionRow key={item.card.id} item={item} total={displayedSummary.totalValue} allocation={view === 'allocation'} />)}
      {view === 'allocation' ? <View style={{ marginTop: 12, gap: 18 }}><Label kind="heading">By set</Label>{setAllocation.map(([name, set]) => <View key={name} style={{ gap: 7 }}><View style={uiStyles.between}><Label kind="caption" style={{ fontWeight: '600', flex: 1 }}>{name}</Label><Label kind="caption" style={uiStyles.muted}>{displayedSummary.totalValue ? (set.value / 100 / displayedSummary.totalValue * 100).toFixed(1) : '0'}%</Label></View><View style={styles.setTrack}><View style={[styles.allocationFill, { width: `${displayedSummary.totalValue ? set.value / 100 / displayedSummary.totalValue * 100 : 0}%` }]} /></View></View>)}</View> : null}
    </View>}
    {entitlements.maxCards !== null ? <View style={styles.membership}><View style={uiStyles.between}><View style={{ flex: 1, gap: 4 }}><Label kind="caption" style={{ fontWeight: '700' }}>Chase Free</Label><Label kind="caption" style={uiStyles.muted}>{summary.totalCopies} / {entitlements.maxCards} copies saved</Label></View><Button title="Upgrade" variant="ghost" onPress={() => router.push('/paywall')} /></View><View style={styles.capacity} accessibilityRole="progressbar" accessibilityLabel="Free collection capacity" accessibilityValue={{ min: 0, max: entitlements.maxCards, now: Math.min(summary.totalCopies, entitlements.maxCards) }}><View style={[styles.allocationFill, { width: `${Math.min(1, summary.totalCopies / entitlements.maxCards) * 100}%` }]} /></View></View> : <Badge tone="warm">Unlimited collection · Pro</Badge>}
    {persistenceError ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{persistenceError}</Label> : null}
    <Label kind="caption" style={uiStyles.muted}>Estimates exclude condition and grading. Sample prices as of {historyDate(HISTORY_AS_OF, true)}; resale values may differ.</Label>
  </Screen>;
}
const styles = StyleSheet.create({
  walletIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  balance: { fontSize: 44, lineHeight: 54, letterSpacing: -1.6 },
  summary: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 18, gap: 12 },
  stat: { fontSize: 24, fontVariant: ['tabular-nums'] },
  historyNote: { flexDirection: 'row', alignItems: 'center', gap: 8 }, method: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  explanation: { borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: 14, paddingVertical: 4 },
  preview: { backgroundColor: colors.primarySoft, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10 },
  closePreview: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  viewTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, gap: 24 }, viewTab: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 2, borderBottomWidth: 2, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: colors.primary },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48, minWidth: 68, justifyContent: 'flex-end' },
  position: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  allocationTrack: { height: 3, marginTop: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', maxWidth: 160 },
  allocationFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  setTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  membership: { paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border, gap: 12 }, capacity: { height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  loading: { gap: 16, alignItems: 'center', paddingVertical: 48 },
});
