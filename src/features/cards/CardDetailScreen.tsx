import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CardStage } from '@/components/CardArtwork';
import { money } from '@/components/CardRow';
import { Badge, Button, EmptyState, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { PriceChart, RangeSelector } from '@/components/PriceChart';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useChase } from '@/features/app/ChaseProvider';
import { colors } from '@/theme/tokens';
import { visualFor } from '@/data/cardVisuals';
import { getCardHistory, getHistoryChange, HISTORY_AS_OF, type HistoryRange } from '@/services/priceHistory';

export function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const cardId = Array.isArray(id) ? id[0] : id;
  return <CardDetailContent key={cardId ?? 'missing'} cardId={cardId ?? ''} />;
}

function CardDetailContent({ cardId }: { cardId: string }) {
  const card = getCatalogCard(cardId);
  const { state, ready, loadError, retryLoad, persistenceError, entitlements, summary, addToCollection, updateQuantity, removeFromCollection } = useChase();
  const item = state.items.find((entry) => entry.cardId === cardId);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showImageInfo, setShowImageInfo] = useState(false);
  const [range, setRange] = useState<HistoryRange>('1M');
  if (!card) return <Screen safeTop={false}><EmptyState title="Card not found" message="This card is not available in the sample catalog." action="Browse cards" onPress={() => router.replace('/search')} icon="search-outline" /></Screen>;
  if (!ready) return <Screen safeTop={false}>{loadError ? <EmptyState title="Collection unavailable" message={loadError} action="Try again" onPress={retryLoad} /> : <ActivityIndicator color={colors.primary} accessibilityLabel="Loading card" />}</Screen>;

  const add = () => {
    const result = addToCollection(card.id);
    setFeedback(result.ok ? { ok: true, message: `One copy of ${card.name} added to your collection.` } : result);
    setConfirmRemove(false);
  };
  const changeQuantity = (quantity: number) => {
    const result = updateQuantity(card.id, quantity);
    setFeedback(result.ok ? { ok: true, message: `Quantity updated to ${quantity}.` } : result);
    setConfirmRemove(false);
  };
  const atLimit = entitlements.maxCards !== null && summary.totalCopies >= entitlements.maxCards;
  const history = getCardHistory(card.id, range);
  const change = getHistoryChange(history);
  const direction = change.amount >= 0 ? '+' : '−';
  const asOf = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(HISTORY_AS_OF));
  return <Screen safeTop={false}>
    <View style={{ gap: 8 }}>
      <View style={uiStyles.between}><Label kind="title" accessibilityRole="header" style={{ flex: 1 }}>{card.name}</Label><Badge tone="warm">{card.variant}</Badge>{visualFor(card).note ? <Pressable accessibilityRole="button" accessibilityLabel="About this printing image" accessibilityState={{ expanded: showImageInfo }} aria-expanded={showImageInfo} onPress={() => setShowImageInfo(!showImageInfo)} style={styles.imageInfo}><Icon name="information-circle-outline" color={colors.muted} size={21} /></Pressable> : null}</View>
      <Label style={uiStyles.muted}>{card.setName} · {card.collectorNumber}</Label>
    </View>
    <CardStage card={card} compact />
    {showImageInfo && visualFor(card).note ? <Label kind="caption" style={uiStyles.muted}>{visualFor(card).note}</Label> : null}
    <View style={styles.priceSection}>
      <View style={uiStyles.between}><Label style={{ fontWeight: '600' }}>Price per copy</Label><Label kind="caption" style={uiStyles.muted}>USD · ungraded</Label></View>
      <Label kind="price">{money(card.marketPrice.amount)}</Label>
      <View style={[uiStyles.row, { gap: 6, flexWrap: 'wrap' }]}>
        <Icon name={change.amount >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={18} color={change.amount >= 0 ? colors.success : colors.danger} />
        <Label kind="caption" style={{ color: change.amount >= 0 ? colors.success : colors.danger, fontWeight: '600' }}>{direction}{money(Math.abs(change.amount))} ({direction}{Math.abs(change.percent).toFixed(2)}%)</Label><Label kind="caption" style={uiStyles.muted}>over {range}</Label>
      </View>
      <Label kind="caption" style={uiStyles.muted}>Sample history · USD</Label>
      <PriceChart points={history} height={150} label={`${card.name} simulated price history in USD`} />
      <RangeSelector value={range} onChange={setRange} label="Card price history period" />
      <Label kind="caption" style={uiStyles.muted}>Sample prices · {asOf}</Label>
    </View>
    <Button title={item ? 'Add one copy' : 'Add to collection'} icon="add-outline" onPress={add} />
    {feedback ? <View style={{ gap: 12 }}>
      <Label accessibilityRole={feedback.ok ? undefined : 'alert'} accessibilityLiveRegion="polite" style={{ color: feedback.ok ? colors.success : colors.danger }}>{feedback.message}</Label>
      {!feedback.ok && atLimit ? <Button title="Upgrade to Chase Pro" onPress={() => router.push('/paywall')} /> : null}
    </View> : null}
    {persistenceError ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{persistenceError}</Label> : null}
    {item ? <View style={styles.holdingSection}>
      <Label kind="heading">In your collection</Label>
      <View style={[uiStyles.between, { flexWrap: 'wrap' }]}>
        <Label style={{ flex: 1 }}>Quantity</Label>
        <View style={uiStyles.row}>
          <View style={{ minWidth: 52 }}><Button title="−" variant="secondary" accessibilityLabel={`Remove one ${card.name} copy`} disabled={item.quantity <= 1} onPress={() => changeQuantity(item.quantity - 1)} /></View>
          <Label kind="heading" accessibilityLabel={`${item.quantity} copies`} style={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</Label>
          <View style={{ minWidth: 52 }}><Button title="+" variant="secondary" accessibilityLabel={`Add one ${card.name} copy`} onPress={() => changeQuantity(item.quantity + 1)} /></View>
        </View>
      </View>
      <Label kind="caption" style={uiStyles.muted}>Estimated total: {money(card.marketPrice.amount * item.quantity)} · demo USD</Label>
      {confirmRemove ? <View style={{ gap: 12 }}>
        <Label accessibilityRole="alert">Remove all {item.quantity} {item.quantity === 1 ? 'copy' : 'copies'} of this card from your collection?</Label>
        <Button title="Keep card" variant="secondary" onPress={() => setConfirmRemove(false)} />
        <Button title="Remove all copies" variant="danger" onPress={() => { removeFromCollection(card.id); setConfirmRemove(false); setFeedback({ ok: true, message: `${card.name} removed from your collection.` }); }} />
      </View> : <Button title="Remove from collection" variant="danger" icon="trash-outline" onPress={() => setConfirmRemove(true)} />}
    </View> : null}
    <Button title="View My Cards" variant="ghost" icon="albums-outline" onPress={() => router.push('/my-cards')} />
  </Screen>;
}

const styles = StyleSheet.create({
  imageInfo: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  priceSection: { gap: 8 },
  holdingSection: { gap: 16, paddingTop: 24, borderTopWidth: 1, borderTopColor: colors.border },
});
