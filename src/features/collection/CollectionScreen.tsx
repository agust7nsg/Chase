import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CardPrint } from '@/components/CardPrint';
import { money } from '@/components/CardRow';
import { PriceChart, RangeSelector } from '@/components/PriceChart';
import { Badge, Button, EmptyState, Icon, Label, Screen, Section, uiStyles } from '@/components/ui';
import { useChase } from '@/features/app/ChaseProvider';
import { summarizeCollection } from '@/services/domain';
import { getHistoryChange, getHoldingMovers, getPortfolioHistory, HISTORY_AS_OF, type HistoryRange, type HoldingMover } from '@/services/priceHistory';
import { colors } from '@/theme/tokens';
import type { CollectionItem } from '@/types/domain';

const exampleItems: CollectionItem[] = ['base1-4', 'swsh7-215', 'swsh11-186', 'sv2-203'].map(cardId => ({ cardId, quantity: 1, addedAt: HISTORY_AS_OF }));
const sign = (value: number) => value > 0 ? '+' : value < 0 ? '−' : '';
const signedMoney = (value: number) => `${sign(value)}${money(Math.abs(value))}`;

function TopCardRow({ item }: { item: HoldingMover }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.card.name}, ${item.card.variant}, ${item.quantity} copies`} onPress={() => router.push({ pathname: '/card/[id]', params: { id: item.card.id } })} style={({ pressed }) => [styles.position, pressed && { opacity: 0.6 }]}>
    <View style={{ width: 40 }}><CardPrint card={item.card} /></View>
    <View style={{ flex: 1, gap: 4, minWidth: 80 }}><Label style={{ fontWeight: '600' }}>{item.card.name}</Label><Label kind="caption" style={uiStyles.muted}>{item.quantity} {item.quantity === 1 ? 'copy' : 'copies'} · {item.card.collectorNumber}</Label></View>
    <View style={{ alignItems: 'flex-end', gap: 4 }}><Label style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(item.card.marketPrice.amount)}</Label><Label kind="caption" style={{ color: item.changeAmount < 0 ? colors.danger : item.changeAmount > 0 ? colors.success : colors.muted, fontVariant: ['tabular-nums'] }}>{`${sign(item.changePercent)}${Math.abs(item.changePercent).toFixed(2)}%`}</Label></View>
  </Pressable>;
}

export function CollectionScreen() {
  const { state, summary, entitlements, ready, loadError, retryLoad, persistenceError } = useChase();
  const [range, setRange] = useState<HistoryRange>('1M');
  const [preview, setPreview] = useState(false);
  const items = preview ? exampleItems : state.items;
  const displayedSummary = preview ? summarizeCollection(exampleItems) : summary;
  const history = useMemo(() => getPortfolioHistory(items, range), [items, range]);
  const change = getHistoryChange(history);
  const movers = useMemo(() => getHoldingMovers(items, range), [items, range]);
  const topCards = [...movers].sort((a, b) => b.card.marketPrice.amount - a.card.marketPrice.amount || a.card.id.localeCompare(b.card.id)).slice(0, 3);
  if (!ready) return <Screen>{loadError ? <EmptyState title="Collection unavailable" message={loadError} action="Try again" onPress={retryLoad} icon="cloud-offline-outline" /> : <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Label>Loading your collection…</Label></View>}</Screen>;
  return <Screen style={{ gap: 24 }}>
    <View style={uiStyles.between}><View style={uiStyles.row}><View style={styles.walletIcon}><Icon name="wallet-outline" color={colors.primary} size={22} /></View><Label kind="title" accessibilityRole="header">Collection</Label></View><Badge tone="neutral">USD</Badge></View>
    {preview ? <View style={styles.preview}><Icon name="information-circle-outline" color={colors.primary} /><Label kind="caption" style={{ flex: 1 }}>Sample collection · preview only</Label><Pressable accessibilityRole="button" accessibilityLabel="Return to my collection" onPress={() => setPreview(false)} style={styles.closePreview}><Icon name="close" size={22} color={colors.primary} /></Pressable></View> : null}
    <View style={{ gap: 10 }}>
      <View style={uiStyles.between}><Label kind="caption" style={uiStyles.muted}>Collection value</Label></View>
      <Label kind="price" style={styles.balance}>{money(displayedSummary.totalValue)}</Label>
      {displayedSummary.totalCopies > 0 ? <><View style={[uiStyles.row, { gap: 6, flexWrap: 'wrap' }]}><Icon name={change.amount < 0 ? 'trending-down-outline' : change.amount > 0 ? 'trending-up-outline' : 'remove-outline'} color={change.amount < 0 ? colors.danger : change.amount > 0 ? colors.success : colors.muted} size={18} /><Label style={{ color: change.amount < 0 ? colors.danger : change.amount > 0 ? colors.success : colors.muted, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{signedMoney(change.amount)} ({sign(change.percent)}{Math.abs(change.percent).toFixed(2)}%)</Label><Label kind="caption" style={uiStyles.muted}>{range}</Label></View>
      <PriceChart points={history} height={172} compact label="Collection value history" color={displayedSummary.totalCopies ? colors.primary : colors.border} />
      <RangeSelector value={range} onChange={setRange} label="Collection history range" />
      </> : null}
    </View>
    {displayedSummary.totalCopies > 0 ? <><View style={styles.summaryDivider} />
    <Button title="My Cards" icon="albums-outline" onPress={() => router.push('/my-cards')} /></> : null}
    {summary.totalCopies === 0 && !preview ? <View style={{ gap: 16, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border }}><Label kind="heading">Your collection starts here</Label><Button title="Browse cards" icon="search-outline" onPress={() => router.push('/search')} /><Button title="Preview sample wallet" variant="secondary" icon="pulse-outline" onPress={() => setPreview(true)} /><Button title="My Cards" variant="ghost" icon="albums-outline" onPress={() => router.push('/my-cards')} /></View> : <View style={{ gap: 12 }}>
      <Section title="Top cards" action="See all" onPress={() => router.push('/my-cards')} />
      {topCards.map(item => <TopCardRow key={item.card.id} item={item} />)}
    </View>}
    {entitlements.maxCards === null ? <Badge tone="warm">Unlimited collection · Pro</Badge> : null}
    {persistenceError ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{persistenceError}</Label> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  walletIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  balance: { fontSize: 44, lineHeight: 54, letterSpacing: -1.6 },
  summaryDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  preview: { backgroundColor: colors.primarySoft, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10 },
  closePreview: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  position: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  loading: { gap: 16, alignItems: 'center', paddingVertical: 48 },
});
