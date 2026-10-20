import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Button, EmptyState, Icon, Label, Screen, SearchField, uiStyles } from '@/components/ui';
import { CardPrint } from '@/components/CardPrint';
import { catalogService } from '@/services/catalog';
import { useCurrency } from '@/features/currency/CurrencyProvider';
import { colors } from '@/theme/tokens';
import type { Card } from '@/types/domain';
import type { PendingCatalogRecognition } from '@/types/scanner';
import { useScanSession } from './ScanSessionProvider';

/** User-confirmed linking only changes pending staging; saving ownership remains in Organize. */
export default function MatchPendingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scan = useScanSession();
  const row = scan.session.unresolved?.find(item => item.id === id);
  const back = () => { if (router.canGoBack()) router.back(); else router.replace('/organize'); };
  if (!scan.ready) return <Screen safeTop={false}><ActivityIndicator color={colors.primary} /></Screen>;
  if (!row) return <Screen safeTop={false}><EmptyState title="Identification already handled" message="Your pending session is kept in Organize." action="Return to Organize" onPress={back} /></Screen>;
  return <MatchPendingContent key={row.id} row={row} />;
}

function MatchPendingContent({ row }: { row: PendingCatalogRecognition }) {
  const id = row.id;
  const scan = useScanSession();
  const candidate = row.recognition.candidates[0];
  const [query, setQuery] = useState(candidate.name);
  const [numberFilter, setNumberFilter] = useState(true);
  const [retry, setRetry] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [variants, setVariants] = useState<Card[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const { formatMoney } = useCurrency();
  useEffect(() => {
    if (variants || !query.trim()) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError(null);
      void catalogService.queryCards({ query: query.trim(),
        collectorNumber: numberFilter ? candidate.collectorNumber.split('/')[0] : undefined,
        page, pageSize: 12, signal: abort.signal }).then(result => {
        if (abort.signal.aborted) return;
        setCards(previous => page === 1 ? result.cards : [...previous, ...result.cards.filter(card => !previous.some(row => row.id === card.id))]);
        setHasMore(result.hasMore);
      }).catch(() => { if (!abort.signal.aborted) setError('Catalog unavailable. Retry when connected.'); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [candidate, query, numberFilter, retry, page, variants]);
  const back = () => { if (router.canGoBack()) router.back(); else router.replace('/organize'); };
  const choose = async (card: Card) => {
    setLoading(true); setError(null);
    try { setVariants(await catalogService.getVariants(card.id)); }
    catch { setError('Printing details could not be loaded. Retry the selection.'); }
    finally { setLoading(false); }
  };
  const confirm = async (card: Card) => {
    setSaving(true); setError(null);
    try { await scan.matchPending(id, card.id); back(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Printing could not be linked.'); }
    finally { setSaving(false); }
  };
  if (variants?.length) return <Screen safeTop={false}>
    <Label kind="title">Confirm printing</Label>
    <CardPrint card={variants[0]} style={{ width: 140, alignSelf: 'center' }} />
    <Label kind="heading">{variants[0].name}</Label>
    <Label style={uiStyles.muted}>{variants[0].setName} · {variants[0].collectorNumber}</Label>
    <Label kind="caption" style={uiStyles.muted}>English catalog · stays in Organize</Label>
    {variants.map(card => <View key={card.id} style={{ gap: 6 }}>
      {variants.length > 1 ? <Label>{card.variant} · {card.marketPrice ? formatMoney(card.marketPrice.amount, card.marketPrice.currency) : 'Price unavailable'}</Label> : null}
      <Button title={variants.length === 1 ? 'Use this printing' : `Use ${card.variant}`} loading={saving} disabled={saving}
        onPress={() => { void confirm(card); }} />
    </View>)}
    {error ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Label> : null}
    <Button title="View card details" variant="ghost" disabled={saving} onPress={() => router.push({ pathname: '/card/[id]', params: { id: variants[0].id, fromScan: '1' } })} />
    <Button title="Back to matching" variant="secondary" disabled={saving} onPress={() => { setVariants(null); setError(null); }} />
  </Screen>;
  return <Screen safeTop={false} scroll={false}>
    <Label kind="title">Match printing</Label>
    <Label kind="caption" style={uiStyles.muted}>{candidate.name} · {candidate.setName} · {candidate.collectorNumber}</Label>
    <SearchField value={query} accessibilityLabel="Search a printing to link" placeholder="Card name" autoCorrect={false}
      onChangeText={value => { setQuery(value); setPage(1); setCards([]); setLoading(false); setHasMore(false); setError(null); }} />
    <Button title={numberFilter ? `Scanned number: ${candidate.collectorNumber.split('/')[0]} · clear filter` : 'Use scanned number filter'} variant="ghost"
      onPress={() => { setNumberFilter(value => !value); setPage(1); setCards([]); }} />
    {error ? <><Label accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Label><Button title="Retry catalog search" variant="secondary" onPress={() => setRetry(value => value + 1)} /></> : null}
    <FlatList data={cards} keyExtractor={card => card.id} keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Match ${item.name}, ${item.setName}, ${item.collectorNumber}`}
        disabled={loading} onPress={() => { void choose(item); }} style={styles.row}>
        <CardPrint card={item} style={{ width: 46 }} /><View style={{ flex: 1, gap: 4 }}>
          <Label style={{ fontWeight: '600' }}>{item.name}</Label><Label kind="caption" style={uiStyles.muted}>{item.setName} · {item.collectorNumber}</Label>
        </View><Icon name="chevron-forward" color={colors.primary} />
      </Pressable>}
      ListEmptyComponent={!loading && !error ? <Label style={uiStyles.muted}>No matching printings. Change the name or clear the number filter.</Label> : null}
      ListFooterComponent={loading ? <ActivityIndicator accessibilityLabel="Loading printing matches" color={colors.primary} /> : hasMore
        ? <Button title="Load more printings" variant="secondary" onPress={() => setPage(value => value + 1)} /> : null} />
  </Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border, minHeight: 80 } });
