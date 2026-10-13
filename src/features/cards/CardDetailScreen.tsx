import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CardArtwork } from '@/components/CardArtwork';
import { money } from '@/components/CardRow';
import { Badge, Button, EmptyState, Label, Panel, Screen, uiStyles } from '@/components/ui';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useChase } from '@/features/app/ChaseProvider';
import { colors } from '@/theme/tokens';

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
  if (!card) return <Screen><EmptyState title="Card not found" message="This card is not available in the sample catalog." action="Browse cards" onPress={() => router.replace('/search')} icon="search-outline" /></Screen>;
  if (!ready) return <Screen>{loadError ? <EmptyState title="Collection unavailable" message={loadError} action="Try again" onPress={retryLoad} /> : <ActivityIndicator color={colors.primary} accessibilityLabel="Loading card" />}</Screen>;

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
  return <Screen>
    <View style={{ gap: 8 }}>
      <Badge>{card.variant.toUpperCase()}</Badge>
      <Label kind="title" accessibilityRole="header">{card.name}</Label>
      <Label style={uiStyles.muted}>{card.setName} · {card.collectorNumber}</Label>
    </View>
    <View style={{ width: '100%', maxWidth: 320, alignSelf: 'center' }}><CardArtwork card={card} /></View>
    <Panel>
      <View style={[uiStyles.between, { flexWrap: 'wrap' }]}><Label>Estimated price per copy</Label><Badge>DEMO USD</Badge></View>
      <Label kind="price">{money(card.marketPrice.amount)}</Label>
      <Label kind="caption" style={uiStyles.muted}>Illustrative ungraded price from the sample dataset. Prices are not live quotes and do not account for your card’s condition.</Label>
      <View style={styles.metadata}>
        <View style={styles.detailRow}><Label kind="caption" style={uiStyles.muted}>Set</Label><Label kind="caption" style={styles.detailValue}>{card.setName}</Label></View>
        <View style={styles.detailRow}><Label kind="caption" style={uiStyles.muted}>Card number</Label><Label kind="caption" style={styles.detailValue}>{card.collectorNumber}</Label></View>
        <View style={styles.detailRow}><Label kind="caption" style={uiStyles.muted}>Variant</Label><Label kind="caption" style={styles.detailValue}>{card.variant}</Label></View>
      </View>
    </Panel>
    <Button title={item ? 'Add one copy' : 'Add to collection'} icon="add-outline" onPress={add} />
    {feedback ? <View style={{ gap: 12 }}>
      <Label accessibilityRole={feedback.ok ? undefined : 'alert'} accessibilityLiveRegion="polite" style={{ color: feedback.ok ? colors.success : colors.danger }}>{feedback.message}</Label>
      {!feedback.ok && atLimit ? <Button title="Upgrade to Chase Pro" onPress={() => router.push('/paywall')} /> : null}
    </View> : null}
    {persistenceError ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{persistenceError}</Label> : null}
    {item ? <Panel>
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
    </Panel> : null}
    <Button title="View My Cards" variant="ghost" icon="albums-outline" onPress={() => router.push('/my-cards')} />
  </Screen>;
}

const styles = StyleSheet.create({
  metadata: { gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  detailValue: { flex: 1, textAlign: 'right', fontWeight: '600' },
});
