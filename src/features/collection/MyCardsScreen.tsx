import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Button, EmptyState, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useChase } from '@/features/app/ChaseProvider';
import { CardTile } from '@/features/cards/CardTile';
import { colors } from '@/theme/tokens';

type Sort = 'date' | 'name' | 'price';
const sortOptions: { value: Sort; label: string }[] = [{ value: 'date', label: 'Recent' }, { value: 'name', label: 'Name A–Z' }, { value: 'price', label: 'Price ↓' }];

export function MyCardsScreen() {
  const { state, summary, ready, loadError, retryLoad } = useChase();
  const { width } = useWindowDimensions();
  const columns = width >= 700 ? 3 : 2;
  const [gridWidth, setGridWidth] = useState(Math.min(width, 760) - 48);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('date');
  const cards = useMemo(() => {
    const search = query.trim().toLowerCase();
    return state.items.flatMap((item) => {
      const card = getCatalogCard(item.cardId);
      if (!card || !card.name.toLowerCase().includes(search)) return [];
      return [{ card, ...item }];
    }).sort((a, b) => {
      if (sort === 'name') return a.card.name.localeCompare(b.card.name) || a.card.id.localeCompare(b.card.id);
      if (sort === 'price') return b.card.marketPrice.amount - a.card.marketPrice.amount || a.card.name.localeCompare(b.card.name);
      return b.addedAt.localeCompare(a.addedAt);
    });
  }, [state.items, query, sort]);
  if (!ready) return <Screen>{loadError ? <EmptyState title="Collection unavailable" message={loadError} action="Try again" onPress={retryLoad} /> : <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your cards" />}</Screen>;
  return <Screen scroll={false} style={{ gap: 16, paddingBottom: 16 }}>
    <View style={uiStyles.between}>
      <View style={{ flex: 1, gap: 4 }}><Label kind="title" accessibilityRole="header">My Cards</Label><Label kind="caption" style={uiStyles.muted}>{summary.uniqueCards} unique cards · {summary.totalCopies} copies</Label></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Find cards to add" onPress={() => router.push('/search')} style={styles.add}><Icon name="add" color={colors.primary} /></Pressable>
    </View>
    <TextInput value={query} onChangeText={setQuery} placeholder="Search your cards by name" placeholderTextColor={colors.muted} accessibilityLabel="Search your cards by name" autoCapitalize="none" autoCorrect={false} style={uiStyles.input} />
    <View accessibilityRole="radiogroup" accessibilityLabel="Sort cards" style={styles.sorts}>
      {sortOptions.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`Sort by ${option.label}`} accessibilityState={{ checked: sort === option.value }} aria-checked={sort === option.value} onPress={() => setSort(option.value)} style={[styles.sort, sort === option.value && styles.selected]}><Label kind="caption" style={{ color: sort === option.value ? colors.primary : colors.muted, fontWeight: '600' }}>{option.label}</Label></Pressable>)}
    </View>
    <FlatList
      key={`cards-${columns}`} data={cards} numColumns={columns} keyExtractor={(item) => item.cardId}
      renderItem={({ item }) => <CardTile card={item.card} quantity={item.quantity} width={(gridWidth - (columns - 1) * 12) / columns} />}
      onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
      columnWrapperStyle={styles.gridRow} contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled"
      ListFooterComponent={cards.length ? <Label kind="caption" style={[uiStyles.muted, { paddingTop: 16 }]}>Prices shown are illustrative demo estimates in USD per copy.</Label> : null}
      ListEmptyComponent={<EmptyState title={query.trim() ? 'No matching cards' : 'No cards yet'} message={query.trim() ? 'Try another name to find a card in your collection.' : 'Browse the sample catalog to start your collection.'} action={query.trim() ? 'Clear search' : 'Browse cards'} onPress={query.trim() ? () => setQuery('') : () => router.push('/search')} icon="search-outline" />}
    />
    <Button title="Browse catalog" variant="secondary" icon="search-outline" onPress={() => router.push('/search')} />
  </Screen>;
}

const styles = StyleSheet.create({
  add: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderRadius: 12 },
  sorts: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sort: { minHeight: 48, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: '#BFDBFE', backgroundColor: colors.primarySoft },
  gridRow: { gap: 12, marginBottom: 12, alignItems: 'stretch' },
  grid: { paddingBottom: 24 },
});
