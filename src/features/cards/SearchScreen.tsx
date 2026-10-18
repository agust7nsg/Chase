import { useCurrency } from '@/features/currency/CurrencyProvider';
import { useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { CardRow } from '@/components/CardRow';
import { EmptyState, Icon, Label, Screen, SearchField, uiStyles } from '@/components/ui';
import { catalog } from '@/data/mocks/catalog';
import { colors } from '@/theme/tokens';
import { CardTile } from './CardTile';
import { showcaseIds } from '@/data/cardVisuals';

export function SearchScreen() {
  const { query } = useLocalSearchParams<{ query?: string }>();
  return <SearchContent key={query ?? ''} initialQuery={query ?? ''} />;
}

function SearchContent({ initialQuery }: { initialQuery: string }) {
  const { currency } = useCurrency();
  const { width, fontScale } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(Math.min(width, 760) - 48);
  const [query, setQuery] = useState(initialQuery);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const columns = layout === 'grid' && fontScale <= 1.3 ? (width >= 700 ? 3 : 2) : 1;
  const cards = useMemo(() => {
    const search = query.trim().toLowerCase();
    return catalog.filter((card) => `${card.name} ${card.setName} ${card.collectorNumber} ${card.variant}`.toLowerCase().includes(search)).sort((a, b) => {
      const order = (id: string) => { const index = showcaseIds.findIndex(featured => featured === id); return index < 0 ? showcaseIds.length : index; };
      return order(a.id) - order(b.id);
    });
  }, [query]);
  return <Screen safeTop={false} scroll={false} style={{ gap: 16, paddingBottom: 16 }}>
    <FlatList
      style={{ marginHorizontal: -24 }}
      ListHeaderComponent={<View style={{ gap: 16, marginBottom: 16 }}>
        <View style={{ gap: 6 }}><Label kind="title" accessibilityRole="header">Card catalog</Label></View>
        <View style={{ gap: 8 }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Try Umbreon or 215/203" placeholderTextColor={colors.muted} accessibilityLabel="Search sample catalog by name, set, or card number" autoCapitalize="none" autoCorrect={false} />
        </View>
        <View style={uiStyles.between}>
          <View style={{ gap: 3 }}><Label style={{ fontWeight: '600' }}>{cards.length} {cards.length === 1 ? 'result' : 'results'}</Label><Label kind="caption" style={uiStyles.muted}>Sample {currency} / copy</Label></View>
          <View style={styles.layoutControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Show grid" accessibilityState={{ selected: layout === 'grid' }} onPress={() => setLayout('grid')} style={[styles.toggle, layout === 'grid' && styles.selected]}><Icon name="grid-outline" color={layout === 'grid' ? colors.primary : colors.muted} size={20} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Show list" accessibilityState={{ selected: layout === 'list' }} onPress={() => setLayout('list')} style={[styles.toggle, layout === 'list' && styles.selected]}><Icon name="list-outline" color={layout === 'list' ? colors.primary : colors.muted} size={22} /></Pressable>
          </View>
        </View>
      </View>}
      key={`catalog-${columns}`} data={cards} numColumns={columns} keyExtractor={(card) => card.id}
      renderItem={({ item }) => layout === 'grid' ? <CardTile card={item} width={(gridWidth - (columns - 1) * 16) / columns} /> : <CardRow card={item} />}
      onLayout={(event) => setGridWidth(event.nativeEvent.layout.width - 48)}
      columnWrapperStyle={columns > 1 ? styles.gridRow : undefined} contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<EmptyState title="No cards found" message="Try a Pokémon name, set, or collector number." action="Clear search" onPress={() => setQuery('')} icon="search-outline" />}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  layoutControls: { flexDirection: 'row', gap: 8 },
  toggle: { minWidth: 48, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.primarySoft },
  gridRow: { gap: 16, marginBottom: 16, alignItems: 'stretch' },
});
