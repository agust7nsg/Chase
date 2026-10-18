import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { CardRow } from '@/components/CardRow';
import { Button, EmptyState, Icon, Label, Screen, SearchField, uiStyles } from '@/components/ui';
import { catalogService } from '@/services/catalog';
import { colors } from '@/theme/tokens';
import { CardTile } from './CardTile';
import { CatalogTabs } from './CatalogTabs';
import { SetLogo } from './SetLogo';
import { SetPicker, SetsDirectory } from './SetsDirectory';

type CatalogPage = Awaited<ReturnType<typeof catalogService.queryCards>>;
type CatalogSet = Awaited<ReturnType<typeof catalogService.listSets>>[number];

export function SearchScreen() {
  const { query, setId, setName, view } = useLocalSearchParams<{ query?: string; setId?: string; setName?: string; view?: string }>();
  return <CatalogContent key={JSON.stringify([query, setId, setName, view])} initialQuery={query ?? ''}
    initialSet={setId ? { id: setId, name: setName ?? setId } : null}
    initialMode={view === 'sets' ? 'sets' : query || setId || view === 'cards' ? 'cards' : 'sets'} />;
}

function CatalogContent({ initialQuery, initialSet, initialMode }: { initialQuery: string; initialSet: CatalogSet | null; initialMode: 'sets' | 'cards' }) {
  const [mode, setMode] = useState(initialMode);
  const [query, setQuery] = useState(initialQuery);
  const [selectedSet, setSelectedSet] = useState<CatalogSet | null>(initialSet);
  return mode === 'sets' ? <SetsDirectory onSearchCards={() => setMode('cards')} />
    : <SearchContent query={query} setQuery={setQuery} selectedSet={selectedSet} setSelectedSet={setSelectedSet} onBrowseSets={() => setMode('sets')} />;
}

function SearchContent({ query, setQuery, selectedSet, setSelectedSet, onBrowseSets }: {
  query: string; setQuery: (query: string) => void; selectedSet: CatalogSet | null; setSelectedSet: (set: CatalogSet | null) => void; onBrowseSets: () => void;
}) {
  const { currency } = useCurrency();
  const { width, fontScale } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(Math.min(width, 760) - 48);
  const [showSets, setShowSets] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [result, setResult] = useState<{ key: string; page: CatalogPage } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<'search' | 'more' | null>(null);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const moreController = useRef<AbortController | null>(null);
  const normalizedQuery = query.trim();
  const setId = selectedSet?.id;
  const searchKey = JSON.stringify([normalizedQuery, setId]);
  const columns = layout === 'grid' && fontScale <= 1.3 ? (width >= 700 ? 3 : 2) : 1;
  const page = result?.key === searchKey ? result.page : undefined;
  const cards = page?.cards ?? [];
  const enabled = Boolean(normalizedQuery || setId);
  const searching = enabled && (loading || (!page && !error));
  const setContext = page?.set ?? selectedSet;
  const noun = setId && !normalizedQuery ? 'cards' : 'results';
  const resultCount = !page && error ? 'Results unavailable' : page?.total !== undefined && page.total > cards.length
    ? `${cards.length} of ${page.total} ${noun}`
    : page?.hasMore ? `${cards.length} cards loaded`
      : `${page?.total ?? cards.length} ${(page?.total ?? cards.length) === 1 ? (noun === 'cards' ? 'card' : 'result') : noun}`;
  const retrySearch = () => { setLoading(true); setError(null); setRetry((value) => value + 1); };
  const chooseSet = (set: CatalogSet | null) => { if (set?.id !== setId) setError(null); setSelectedSet(set); setShowSets(false); };

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    moreController.current?.abort();
    if (!enabled) return () => controller.abort();
    const timer = setTimeout(() => {
      setLoading(true); setLoadingMore(false); setError(null);
      void catalogService.queryCards({ query: normalizedQuery, setId, page: 1, pageSize: 24, signal: controller.signal }).then((next) => {
        if (current === generation.current && !controller.signal.aborted) setResult({ key: searchKey, page: next });
      }).catch(() => {
        if (current === generation.current && !controller.signal.aborted) setError('search');
      }).finally(() => {
        if (current === generation.current && !controller.signal.aborted) setLoading(false);
      });
    }, normalizedQuery ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); moreController.current?.abort(); };
  }, [normalizedQuery, setId, searchKey, retry, enabled]);

  const loadMore = () => {
    if (!page?.hasMore || loading || loadingMore) return;
    const current = generation.current;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true); setError(null);
    void catalogService.queryCards({ query: normalizedQuery, setId, page: page.page + 1, pageSize: 24, signal: controller.signal }).then((next) => {
      if (current !== generation.current || controller.signal.aborted) return;
      setResult((previous) => {
        if (previous?.key !== searchKey) return previous;
        const existing = new Set(previous.page.cards.map((card) => card.id));
        return { key: searchKey, page: { ...next, cards: [...previous.page.cards, ...next.cards.filter((card) => !existing.has(card.id))] } };
      });
    }).catch(() => {
      if (current === generation.current && !controller.signal.aborted) setError('more');
    }).finally(() => {
      if (current === generation.current && !controller.signal.aborted) setLoadingMore(false);
    });
  };

  return <Screen safeTop={false} scroll={false} style={{ gap: 16, paddingBottom: 16 }}>
    <FlatList
      style={{ marginHorizontal: -24 }}
      ListHeaderComponent={<View style={{ gap: 16, marginBottom: 16 }}>
        <Label kind="title" accessibilityRole="header">Card catalog</Label>
        <CatalogTabs value="cards" onChange={mode => { if (mode === 'sets') onBrowseSets(); }} />
        {setContext ? <View style={[uiStyles.row, { gap: 16 }]}>
          {searching && !page?.set ? <View style={{ width: 88, height: 52, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View> : <SetLogo set={setContext} />}
          <Label kind="heading" accessibilityRole="header" style={{ flex: 1 }}>{setContext.name}</Label>
        </View> : null}
        <SearchField value={query} onChangeText={(value) => { if (value.trim() !== normalizedQuery) setError(null); setQuery(value); }} placeholder="Try Umbreon or 215/203" placeholderTextColor={colors.muted} accessibilityLabel="Search cards by name, set, or collector number" autoCapitalize="none" autoCorrect={false} />
        <View style={[uiStyles.row, { flexWrap: 'wrap', gap: 8 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Filter by set, ${selectedSet?.name ?? 'all sets'}`} accessibilityState={{ expanded: showSets }} onPress={() => setShowSets(true)} style={({ pressed }) => [styles.setFilter, pressed && { opacity: 0.65 }]}>
            <Icon name="layers-outline" size={18} color={colors.primary} /><Label style={{ color: colors.primary, fontWeight: '600' }}>{selectedSet ? 'Change set' : 'All sets'}</Label><Icon name="chevron-down" size={16} color={colors.primary} />
          </Pressable>
          {selectedSet ? <Pressable accessibilityRole="button" accessibilityLabel="Clear set filter" onPress={() => chooseSet(null)} style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.65 }]}><Icon name="close-outline" color={colors.muted} /></Pressable> : null}
        </View>
        {enabled ? <View style={uiStyles.between}>
          <View style={{ gap: 3, flex: 1 }} accessibilityLiveRegion="polite">
            <Label style={{ fontWeight: '600' }}>{searching ? 'Searching cards…' : resultCount}</Label>
            <Label kind="caption" style={uiStyles.muted}>{setId ? 'Number order · ' : ''}{currency} / copy</Label>
          </View>
          <View style={styles.layoutControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Show grid" accessibilityState={{ selected: layout === 'grid' }} aria-pressed={layout === 'grid'} onPress={() => setLayout('grid')} style={[styles.toggle, layout === 'grid' && styles.selected]}><Icon name="grid-outline" color={layout === 'grid' ? colors.primary : colors.muted} size={20} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Show list" accessibilityState={{ selected: layout === 'list' }} aria-pressed={layout === 'list'} onPress={() => setLayout('list')} style={[styles.toggle, layout === 'list' && styles.selected]}><Icon name="list-outline" color={layout === 'list' ? colors.primary : colors.muted} size={22} /></Pressable>
          </View>
        </View> : null}
        {page?.stale ? <Label kind="caption" style={uiStyles.muted}>Saved results · could not refresh the catalog.</Label> : null}
        {page?.stale && !error ? <Button title="Retry catalog" variant="secondary" onPress={retrySearch} loading={searching} /> : null}
        {error === 'search' && cards.length > 0 ? <View style={{ gap: 8 }}><Label accessibilityRole="alert" style={uiStyles.muted}>The catalog could not be refreshed. Your loaded cards are still available.</Label><Button title="Try again" variant="secondary" onPress={retrySearch} /></View> : null}
      </View>}
      key={`catalog-${columns}`} data={cards} numColumns={columns} keyExtractor={(card) => card.id}
      renderItem={({ item }) => layout === 'grid' ? <CardTile card={item} width={(gridWidth - (columns - 1) * 16) / columns} /> : <CardRow card={item} />}
      onLayout={(event) => setGridWidth(event.nativeEvent.layout.width - 48)}
      columnWrapperStyle={columns > 1 ? styles.gridRow : undefined} contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={!enabled ? <EmptyState title="Search across all sets" message="Find a card by name or collector number." action="Browse sets" onPress={onBrowseSets} icon="search-outline" /> : searching ? <View style={styles.loading}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading catalog cards" /></View> : error ? <EmptyState title="Catalog unavailable" message="Check your connection and try again. Saved collection cards remain available." action="Try again" onPress={retrySearch} icon="cloud-offline-outline" /> : <EmptyState title="No cards found" message="Try a Pokémon name, a different set, or a collector number." action="Clear filters" onPress={() => { setError(null); setQuery(''); setSelectedSet(null); }} icon="search-outline" />}
      ListFooterComponent={cards.length > 0 && (page?.hasMore || error === 'more') ? <View style={{ gap: 12, paddingTop: 8 }}>{error === 'more' ? <Label accessibilityRole="alert" style={uiStyles.muted}>More cards could not be loaded. Check your connection and retry.</Label> : null}<Button title={error === 'more' ? 'Retry loading more' : 'Load more cards'} variant="secondary" onPress={loadMore} loading={loadingMore} disabled={loading} /></View> : null}
    />
    {showSets ? <SetPicker selectedId={setId} onClose={() => setShowSets(false)} onSelect={chooseSet} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  layoutControls: { flexDirection: 'row', gap: 8 },
  toggle: { minWidth: 48, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.primarySoft },
  setFilter: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, borderRadius: 10, backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 10 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  gridRow: { gap: 16, marginBottom: 16, alignItems: 'stretch' },
});
