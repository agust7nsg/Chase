import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CardStage } from '@/components/CardArtwork';

import { Badge, Button, EmptyState, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { PriceChart, RangeSelector } from '@/components/PriceChart';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useChase } from '@/features/app/ChaseProvider';
import { colors } from '@/theme/tokens';
import { visualFor } from '@/data/cardVisuals';
import { getCardHistory, getHistoryChange, HISTORY_AS_OF, type HistoryRange } from '@/services/priceHistory';
import { CatalogError, catalogService } from '@/services/catalog';
import type { Card } from '@/types/domain';

export function CardDetailScreen() {
  const { id, fromScan } = useLocalSearchParams<{ id: string | string[]; fromScan?: string }>();
  const cardId = Array.isArray(id) ? id[0] : id;
  return <CardDetailContent key={cardId ?? 'missing'} cardId={cardId ?? ''} previewOnly={fromScan === '1'} />;
}

function CardDetailContent({ cardId, previewOnly = false }: { cardId: string; previewOnly?: boolean }) {
  const { currency, formatMoney: money } = useCurrency();
  const [card, setCard] = useState<Card | undefined>(() => getCatalogCard(cardId));
  const [loading, setLoading] = useState(() => !card || Boolean(card.catalogIdentity));
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [variants, setVariants] = useState<Card[]>([]);
  const [retry, setRetry] = useState(0);
  const [detailsReady, setDetailsReady] = useState(() => Boolean(card && (!card.catalogIdentity || card.availableVariants?.length)));
  const { state, ready, loadError, retryLoad, persistenceError, entitlements, summary, addToCollection, updateQuantity, removeFromCollection } = useChase();
  const item = state.items.find((entry) => entry.cardId === (card?.id ?? cardId));
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showImageInfo, setShowImageInfo] = useState(false);
  const [range, setRange] = useState<HistoryRange>('1M');
  useEffect(() => {
    const saved = getCatalogCard(cardId);
    // Raw legacy keys belong to the saved sample catalog, even when a provider uses the same key.
    if (saved && !saved.catalogIdentity) return;
    let active = true;
    void catalogService.getCard(cardId).then(async (next) => {
      if (!active) return;
      if (!next) { setNotFound(true); return; }
      setCard(next); setDetailsReady(true);
      try {
        const choices = await catalogService.getVariants(next.id);
        if (active) setVariants(choices);
      } catch (error) {
        if (active) {
          if (error instanceof CatalogError && error.cachedCards) setVariants(error.cachedCards);
          setCatalogError('Variant details could not be refreshed. Loaded printing details are shown.');
        }
      }
    }).catch((error: unknown) => {
      if (!active) return;
      const cached = error instanceof CatalogError ? error.cachedCard : undefined;
      if (cached) { setCard(cached); setDetailsReady(true); }
      setCatalogError(cached || saved ? 'Card details could not be refreshed. Saved details are shown.' : 'Card details could not be loaded. Check your connection and try again.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cardId, retry]);
  const retryCard = () => { setLoading(true); setCatalogError(null); setNotFound(false); setRetry((value) => value + 1); };

  if (!card) return <Screen safeTop={false}>{loading ? <View style={{ alignItems: 'center', gap: 12, paddingVertical: 40 }}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading card details" /><Label style={uiStyles.muted}>Loading card details…</Label></View> : catalogError ? <EmptyState title="Card unavailable" message={catalogError} action="Try again" onPress={retryCard} icon="cloud-offline-outline" /> : <EmptyState title="Card not found" message="This printing is not available in the catalog." action="Browse cards" onPress={() => router.replace('/search')} icon="search-outline" />}</Screen>;
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
  const quote = card.marketPrice;
  const sample = quote?.source === 'mock' && !card.catalogIdentity;
  const history = sample ? getCardHistory(card.id, range) : [];
  const change = getHistoryChange(history);
  const direction = change.amount >= 0 ? '+' : '−';
  const asOf = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(HISTORY_AS_OF));
  const variantChoices = card.availableVariants?.length ? card.availableVariants : variants.map((variant) => ({ id: variant.id, label: variant.variant }));
  const imageNote = visualFor(card).note;
  const sourceName = quote?.source === 'tcgplayer' ? 'TCGplayer' : quote?.source === 'cardmarket' ? 'Cardmarket' : 'Sample price';
  const quoteDate = quote && Number.isFinite(Date.parse(quote.updatedAt)) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(quote.updatedAt)) : null;
  return <Screen safeTop={false}>
    <View style={{ gap: 8 }}>
      <View style={uiStyles.between}><Label kind="title" accessibilityRole="header" style={{ flex: 1 }}>{card.name}</Label><Badge tone="warm">{card.variant}</Badge>{imageNote ? <Pressable accessibilityRole="button" accessibilityLabel="About this printing image" accessibilityState={{ expanded: showImageInfo }} aria-expanded={showImageInfo} onPress={() => setShowImageInfo(!showImageInfo)} style={styles.imageInfo}><Icon name="information-circle-outline" color={colors.muted} size={21} /></Pressable> : null}</View>
      <Label style={uiStyles.muted}>{card.setName} · {card.collectorNumber}</Label>
    </View>
    <CardStage card={card} compact />
    {showImageInfo && imageNote ? <Label kind="caption" style={uiStyles.muted}>{imageNote}</Label> : null}
    {loading ? <View style={[uiStyles.row, { gap: 8 }]}><ActivityIndicator color={colors.primary} size="small" /><Label kind="caption" style={uiStyles.muted}>Loading printing details…</Label></View> : null}
    {catalogError || notFound ? <View style={{ gap: 8 }}><Label accessibilityRole="alert" style={uiStyles.muted}>{catalogError ?? 'This printing could not be refreshed. Saved details are shown.'}</Label><Button title="Retry card details" variant="secondary" onPress={retryCard} loading={loading} /></View> : null}
    {variantChoices.length > 1 ? <View style={{ gap: 8 }}><Label style={{ fontWeight: '600' }}>Variant</Label><View style={[uiStyles.row, { flexWrap: 'wrap', gap: 8 }]}>{variantChoices.map((variant) => <Pressable key={variant.id} accessibilityRole="button" accessibilityLabel={`View ${variant.label} variant`} accessibilityState={{ selected: variant.id === card.id }} aria-pressed={variant.id === card.id} onPress={() => { if (variant.id !== card.id) router.replace({ pathname: '/card/[id]', params: { id: variant.id, ...(previewOnly ? { fromScan: '1' } : {}) } }); }} style={({ pressed }) => [styles.variant, variant.id === card.id && styles.selectedVariant, pressed && { opacity: 0.65 }]}><Label style={{ color: variant.id === card.id ? colors.primary : colors.text, fontWeight: '600' }}>{variant.label}</Label></Pressable>)}</View></View> : null}
    <View style={styles.priceSection}>
      <View style={uiStyles.between}><Label style={{ fontWeight: '600' }}>Price per copy</Label><Label kind="caption" style={uiStyles.muted}>{currency} · ungraded</Label></View>
      {quote ? <Label kind="price">{money(quote.amount, quote.currency)}</Label> : <Label kind="heading">Price unavailable</Label>}
      {sample ? <><View style={[uiStyles.row, { gap: 6, flexWrap: 'wrap' }]}>
        <Icon name={change.amount >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={18} color={change.amount >= 0 ? colors.success : colors.danger} />
        <Label kind="caption" style={{ color: change.amount >= 0 ? colors.success : colors.danger, fontWeight: '600' }}>{direction}{money(Math.abs(change.amount))} ({direction}{Math.abs(change.percent).toFixed(2)}%)</Label><Label kind="caption" style={uiStyles.muted}>over {range}</Label>
      </View>
      <Label kind="caption" style={uiStyles.muted}>Sample history · {currency}</Label>
      <PriceChart points={history} height={150} label={`${card.name} simulated price history in ${currency}`} />
      <RangeSelector value={range} onChange={setRange} label="Card price history period" />
      <Label kind="caption" style={uiStyles.muted}>Sample prices · {asOf}</Label></> : quote ? <><Label kind="caption" style={uiStyles.muted}>{sourceName}{quoteDate ? ` · updated ${quoteDate}` : ''} · {quote.currency}</Label><Label kind="caption" style={uiStyles.muted}>Estimate for this variant. Price history is unavailable.</Label></> : <Label kind="caption" style={uiStyles.muted}>No ungraded quote is available for this variant.</Label>}
    </View>
    {card.description ? <Label style={uiStyles.muted}>{card.description}</Label> : null}
    {!previewOnly ? <Button title={item ? 'Add one copy' : 'Add to collection'} icon="add-outline" onPress={add} disabled={!detailsReady || loading} /> : null}
    {feedback ? <View style={{ gap: 12 }}>
      <Label accessibilityRole={feedback.ok ? undefined : 'alert'} accessibilityLiveRegion="polite" style={{ color: feedback.ok ? colors.success : colors.danger }}>{feedback.message}</Label>
      {!feedback.ok && atLimit ? <Button title="Upgrade to Chase Pro" onPress={() => router.push('/paywall')} /> : null}
    </View> : null}
    {persistenceError ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{persistenceError}</Label> : null}
    {item && !previewOnly ? <View style={styles.holdingSection}>
      <Label kind="heading">In your collection</Label>
      <View style={[uiStyles.between, { flexWrap: 'wrap' }]}>
        <Label style={{ flex: 1 }}>Quantity</Label>
        <View style={uiStyles.row}>
          <View style={{ minWidth: 52 }}><Button title="−" variant="secondary" accessibilityLabel={`Remove one ${card.name} copy`} disabled={item.quantity <= 1} onPress={() => changeQuantity(item.quantity - 1)} /></View>
          <Label kind="heading" accessibilityLabel={`${item.quantity} copies`} style={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</Label>
          <View style={{ minWidth: 52 }}><Button title="+" variant="secondary" accessibilityLabel={`Add one ${card.name} copy`} onPress={() => changeQuantity(item.quantity + 1)} /></View>
        </View>
      </View>
      <Label kind="caption" style={uiStyles.muted}>{quote ? `Estimated total: ${money(quote.amount * item.quantity, quote.currency)}${sample ? ` · demo ${currency}` : ''}` : 'Estimated total unavailable · price missing'}</Label>
      {confirmRemove ? <View style={{ gap: 12 }}>
        <Label accessibilityRole="alert">Remove all {item.quantity} {item.quantity === 1 ? 'copy' : 'copies'} of this card from your collection?</Label>
        <Button title="Keep card" variant="secondary" onPress={() => setConfirmRemove(false)} />
        <Button title="Remove all copies" variant="danger" onPress={() => { removeFromCollection(card.id); setConfirmRemove(false); setFeedback({ ok: true, message: `${card.name} removed from your collection.` }); }} />
      </View> : <Button title="Remove from collection" variant="danger" icon="trash-outline" onPress={() => setConfirmRemove(true)} />}
    </View> : null}
    {previewOnly ? <Button title="Return to Organize" variant="secondary" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/organize'); }} /> : <Button title="View My Cards" variant="ghost" icon="albums-outline" onPress={() => router.push('/my-cards')} />}
  </Screen>;
}

const styles = StyleSheet.create({
  imageInfo: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  variant: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  selectedVariant: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  priceSection: { gap: 8 },
  holdingSection: { gap: 16, paddingTop: 24, borderTopWidth: 1, borderTopColor: colors.border },
});
