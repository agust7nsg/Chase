import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { CardRow } from '@/components/CardRow';
import { Button, EmptyState, Icon, Label, Screen, SearchField, uiStyles } from '@/components/ui';
import { catalogService } from '@/services/catalog';
import { colors } from '@/theme/tokens';
import { CardTile } from './CardTile';

type CatalogPage = Awaited<ReturnType<typeof catalogService.queryCards>>;
type CatalogSet = Awaited<ReturnType<typeof catalogService.listSets>>[number];

export function SearchScreen() {
  const { query, setId, setName } = useLocalSearchParams<{ query?: string; setId?: string; setName?: string }>();
  return <SearchContent key={JSON.stringify([query, setId, setName])} initialQuery={query ?? ''} initialSet={setId ? { id: setId, name: setName ?? setId } : null} />;
}

function SearchContent({ initialQuery, initialSet }: { initialQuery: string; initialSet: CatalogSet | null }) {
  const { currency } = useCurrency();
  const { width, fontScale } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(Math.min(width, 760) - 48);
  const [query, setQuery] = useState(initialQuery);
  const [selectedSet, setSelectedSet] = useState<CatalogSet | null>(initialSet);
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
  const searching = loading || (!page && !error);
  const retrySearch = () => { setLoading(true); setError(null); setRetry((value) => value + 1); };
  const chooseSet = (set: CatalogSet | null) => { if (set?.id !== setId) setError(null); setSelectedSet(set); setShowSets(false); };

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    moreController.current?.abort();
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
  }, [normalizedQuery, setId, searchKey, retry]);

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
        <SearchField value={query} onChangeText={(value) => { if (value.trim() !== normalizedQuery) setError(null); setQuery(value); }} placeholder="Try Umbreon or 215/203" placeholderTextColor={colors.muted} accessibilityLabel="Search cards by name, set, or collector number" autoCapitalize="none" autoCorrect={false} />
        <View style={[uiStyles.row, { flexWrap: 'wrap', gap: 8 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Filter by set, ${selectedSet?.name ?? 'all sets'}`} accessibilityState={{ expanded: showSets }} onPress={() => setShowSets(true)} style={({ pressed }) => [styles.setFilter, pressed && { opacity: 0.65 }]}>
            <Icon name="layers-outline" size={18} color={colors.primary} /><Label style={{ color: colors.primary, fontWeight: '600' }}>{selectedSet?.name ?? 'All sets'}</Label><Icon name="chevron-down" size={16} color={colors.primary} />
          </Pressable>
          {selectedSet ? <Pressable accessibilityRole="button" accessibilityLabel="Clear set filter" onPress={() => chooseSet(null)} style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.65 }]}><Icon name="close-outline" color={colors.muted} /></Pressable> : null}
        </View>
        <View style={uiStyles.between}>
          <View style={{ gap: 3, flex: 1 }} accessibilityLiveRegion="polite">
            <Label style={{ fontWeight: '600' }}>{searching ? 'Searching cards…' : page?.total !== undefined ? `${page.total} ${page.total === 1 ? 'result' : 'results'}` : `${cards.length} ${cards.length === 1 ? 'result' : 'results'}${page?.hasMore ? ' shown' : ''}`}</Label>
            <Label kind="caption" style={uiStyles.muted}>{currency} / copy · quotes when available</Label>
          </View>
          <View style={styles.layoutControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Show grid" accessibilityState={{ selected: layout === 'grid' }} aria-pressed={layout === 'grid'} onPress={() => setLayout('grid')} style={[styles.toggle, layout === 'grid' && styles.selected]}><Icon name="grid-outline" color={layout === 'grid' ? colors.primary : colors.muted} size={20} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Show list" accessibilityState={{ selected: layout === 'list' }} aria-pressed={layout === 'list'} onPress={() => setLayout('list')} style={[styles.toggle, layout === 'list' && styles.selected]}><Icon name="list-outline" color={layout === 'list' ? colors.primary : colors.muted} size={22} /></Pressable>
          </View>
        </View>
        {page?.fromCache ? <Label kind="caption" style={uiStyles.muted}>{page.stale ? 'Saved results · could not refresh the catalog.' : 'Cached catalog results'}</Label> : null}
        {page?.stale && !error ? <Button title="Retry catalog" variant="secondary" onPress={retrySearch} loading={searching} /> : null}
        {error === 'search' && cards.length > 0 ? <View style={{ gap: 8 }}><Label accessibilityRole="alert" style={uiStyles.muted}>The catalog could not be refreshed. Your loaded cards are still available.</Label><Button title="Try again" variant="secondary" onPress={retrySearch} /></View> : null}
      </View>}
      key={`catalog-${columns}`} data={cards} numColumns={columns} keyExtractor={(card) => card.id}
      renderItem={({ item }) => layout === 'grid' ? <CardTile card={item} width={(gridWidth - (columns - 1) * 16) / columns} /> : <CardRow card={item} />}
      onLayout={(event) => setGridWidth(event.nativeEvent.layout.width - 48)}
      columnWrapperStyle={columns > 1 ? styles.gridRow : undefined} contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={searching ? <View style={styles.loading}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading catalog cards" /></View> : error ? <EmptyState title="Catalog unavailable" message="Check your connection and try again. Saved collection cards remain available." action="Try again" onPress={retrySearch} icon="cloud-offline-outline" /> : <EmptyState title="No cards found" message="Try a Pokémon name, a different set, or a collector number." action="Clear filters" onPress={() => { setError(null); setQuery(''); setSelectedSet(null); }} icon="search-outline" />}
      ListFooterComponent={cards.length > 0 && (page?.hasMore || error === 'more') ? <View style={{ gap: 12, paddingTop: 8 }}>{error === 'more' ? <Label accessibilityRole="alert" style={uiStyles.muted}>More cards could not be loaded. Check your connection and retry.</Label> : null}<Button title={error === 'more' ? 'Retry loading more' : 'Load more cards'} variant="secondary" onPress={loadMore} loading={loadingMore} disabled={loading} /></View> : null}
    />
    {showSets ? <SetPicker selectedId={setId} onClose={() => setShowSets(false)} onSelect={chooseSet} /> : null}
  </Screen>;
}

function SetPicker({ selectedId, onSelect, onClose }: { selectedId?: string; onSelect: (set: CatalogSet | null) => void; onClose: () => void }) {
  const [sets, setSets] = useState<CatalogSet[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void catalogService.listSets().then((next) => { if (active) setSets(next); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const filteredSets = useMemo(() => sets.filter((set) => `${set.name} ${set.id}`.toLowerCase().includes(query.trim().toLowerCase())), [sets, query]);
  return <Modal animationType="none" onRequestClose={onClose}>
    <Screen scroll={false} style={{ gap: 16 }}>
      <View style={uiStyles.between}><Label kind="title" accessibilityRole="header">Choose a set</Label><Pressable accessibilityRole="button" accessibilityLabel="Close set filter" onPress={onClose} style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.65 }]}><Icon name="close-outline" /></Pressable></View>
      <SearchField value={query} onChangeText={setQuery} placeholder="Search sets" accessibilityLabel="Search Pokémon card sets" autoCorrect={false} />
      <FlatList data={filteredSets} keyExtractor={(set) => set.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={<Pressable accessibilityRole="button" accessibilityState={{ selected: !selectedId }} aria-pressed={!selectedId} onPress={() => onSelect(null)} style={({ pressed }) => [styles.setRow, pressed && { opacity: 0.65 }]}><Label style={{ flex: 1, fontWeight: '600' }}>All sets</Label>{!selectedId ? <Icon name="checkmark" color={colors.primary} /> : null}</Pressable>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Filter by ${item.name}`} accessibilityState={{ selected: selectedId === item.id }} aria-pressed={selectedId === item.id} onPress={() => onSelect(item)} style={({ pressed }) => [styles.setRow, pressed && { opacity: 0.65 }]}><View style={{ flex: 1, gap: 3 }}><Label style={{ fontWeight: '600' }}>{item.name}</Label>{item.cardCount ? <Label kind="caption" style={uiStyles.muted}>{item.cardCount.total} cards</Label> : null}</View>{selectedId === item.id ? <Icon name="checkmark" color={colors.primary} /> : null}</Pressable>}
        ListEmptyComponent={loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading sets" /></View> : error ? <EmptyState title="Sets unavailable" message="Check your connection and try again." action="Try again" onPress={() => { setLoading(true); setError(false); setRetry((value) => value + 1); }} icon="cloud-offline-outline" /> : <EmptyState title="No sets found" message="Try another set name." action="Clear search" onPress={() => setQuery('')} icon="search-outline" />}
      />
    </Screen>
  </Modal>;
}

const styles = StyleSheet.create({
  layoutControls: { flexDirection: 'row', gap: 8 },
  toggle: { minWidth: 48, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.primarySoft },
  setFilter: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, borderRadius: 10, backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 10 },
  setRow: { minHeight: 64, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  loading: { paddingVertical: 40, alignItems: 'center' },
  gridRow: { gap: 16, marginBottom: 16, alignItems: 'stretch' },
});
