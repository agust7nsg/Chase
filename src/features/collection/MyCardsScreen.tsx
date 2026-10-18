import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Button, EmptyState, Icon, Label, Screen, SearchField, uiStyles } from '@/components/ui';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useChase } from '@/features/app/ChaseProvider';
import { CardTile } from '@/features/cards/CardTile';
import { colors } from '@/theme/tokens';

type Sort = 'date' | 'name' | 'price';
const sortOptions: { value: Sort; label: string }[] = [{ value: 'date', label: 'Recent' }, { value: 'name', label: 'Name A–Z' }, { value: 'price', label: 'Price ↓' }];

export function MyCardsScreen() {
  const { currency } = useCurrency();
  const { state, summary, ready, loadError, retryLoad } = useChase();
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale > 1.3 ? 1 : width >= 700 ? 3 : 2;
  const [gridWidth, setGridWidth] = useState(Math.min(width, 760) - 48);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('date');
  const cards = useMemo(() => {
    const search = query.trim().toLowerCase();
    return state.items.flatMap((item) => {
      const card = getCatalogCard(item.cardId);
      if (!card || !`${card.name} ${card.setName} ${card.collectorNumber} ${card.variant}`.toLowerCase().includes(search)) return [];
      return [{ card, ...item }];
    }).sort((a, b) => {
      if (sort === 'name') return a.card.name.localeCompare(b.card.name) || a.card.id.localeCompare(b.card.id);
      if (sort === 'price') return b.card.marketPrice.amount - a.card.marketPrice.amount || a.card.name.localeCompare(b.card.name);
      return b.addedAt.localeCompare(a.addedAt);
    });
  }, [state.items, query, sort]);
  if (!ready) return <Screen safeTop={false}>{loadError ? <EmptyState title="Collection unavailable" message={loadError} action="Try again" onPress={retryLoad} /> : <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your cards" />}</Screen>;
  return <Screen safeTop={false} scroll={false} style={{ gap: 16, paddingBottom: 16 }}>
    <FlatList
      style={{ marginHorizontal: -24 }}
      ListHeaderComponent={<View style={{ gap: 16, marginBottom: 16 }}>
        <View style={uiStyles.between}>
          <View style={{ gap: 4, flex: 1 }}><Label kind="title" accessibilityRole="header">My Cards</Label><Label kind="caption" style={uiStyles.muted}>{summary.uniqueCards} unique cards · {summary.totalCopies} copies</Label></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Find cards to add" onPress={() => router.push('/search')} style={styles.add}><Icon name="add-outline" color={colors.primary} /><Label style={{ color: colors.primary, fontWeight: '600' }}>Add</Label></Pressable>
        </View>
        <View style={{ gap: 8 }}><SearchField value={query} onChangeText={setQuery} placeholder="Name, set or card number" placeholderTextColor={colors.muted} accessibilityLabel="Search your cards by name" autoCapitalize="none" autoCorrect={false} /></View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Sort cards" style={styles.sorts}>
          {sortOptions.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`Sort by ${option.label}`} accessibilityState={{ checked: sort === option.value }} aria-checked={sort === option.value} onPress={() => setSort(option.value)} style={[styles.sort, sort === option.value && styles.selected]}><Label kind="caption" style={{ color: sort === option.value ? colors.primary : colors.muted, fontWeight: '600' }}>{option.label}</Label></Pressable>)}
        </View>
      </View>}
      key={`cards-${columns}`} data={cards} numColumns={columns} keyExtractor={(item) => item.cardId}
      renderItem={({ item }) => <CardTile card={item.card} quantity={item.quantity} width={(gridWidth - (columns - 1) * 16) / columns} />}
      onLayout={(event) => setGridWidth(event.nativeEvent.layout.width - 48)}
      columnWrapperStyle={columns > 1 ? styles.gridRow : undefined} contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled"
      ListFooterComponent={<View style={{ gap: 16, paddingTop: 16 }}>{cards.length ? <Label kind="caption" style={uiStyles.muted}>Sample {currency} / copy</Label> : null}<Button title="Browse catalog" variant="ghost" icon="search-outline" onPress={() => router.push('/search')} /></View>}
      ListEmptyComponent={<EmptyState title={query.trim() ? 'No matching cards' : 'No cards yet'} message={query.trim() ? 'Try another name to find a card in your collection.' : 'Find your first favorite in the catalog.'} action={query.trim() ? 'Clear search' : 'Browse cards'} onPress={query.trim() ? () => setQuery('') : () => router.push('/search')} icon="search-outline" />}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  add: { minHeight: 48, minWidth: 72, gap: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  sorts: { flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderColor: colors.border },
  sort: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: 4, paddingVertical: 8 },
  selected: { borderBottomColor: colors.primary },
  gridRow: { gap: 16, marginBottom: 16, alignItems: 'stretch' },
  grid: { paddingBottom: 24, paddingHorizontal: 24 },
});
