import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { CardRow } from '@/components/CardRow';
import { Badge, EmptyState, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { catalog } from '@/data/mocks/catalog';
import { colors } from '@/theme/tokens';
import { CardTile } from './CardTile';

export function SearchScreen() {
  const { width } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(Math.min(width, 760) - 48);
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const columns = layout === 'grid' ? (width >= 700 ? 3 : 2) : 1;
  const cards = useMemo(() => {
    const search = query.trim().toLowerCase();
    return catalog.filter((card) => `${card.name} ${card.setName} ${card.collectorNumber} ${card.variant}`.toLowerCase().includes(search));
  }, [query]);
  return <Screen scroll={false} style={{ gap: 16, paddingBottom: 16 }}>
    <View style={{ gap: 8 }}>
      <Label kind="title" accessibilityRole="header">Find your next card</Label>
      <Label style={uiStyles.muted}>Search the sample catalog. Manual search is always free.</Label>
      <Badge>SAMPLE CATALOG</Badge>
    </View>
    <TextInput value={query} onChangeText={setQuery} placeholder="Name, set, or card number" placeholderTextColor={colors.muted} accessibilityLabel="Search sample catalog by name, set, or card number" autoCapitalize="none" autoCorrect={false} style={uiStyles.input} />
    <View style={uiStyles.between}>
      <Label kind="caption" style={uiStyles.muted}>{cards.length} {cards.length === 1 ? 'result' : 'results'}</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Show grid" accessibilityState={{ selected: layout === 'grid' }} onPress={() => setLayout('grid')} style={[styles.toggle, layout === 'grid' && styles.selected]}><Icon name="grid-outline" color={layout === 'grid' ? colors.primary : colors.muted} size={20} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Show list" accessibilityState={{ selected: layout === 'list' }} onPress={() => setLayout('list')} style={[styles.toggle, layout === 'list' && styles.selected]}><Icon name="list-outline" color={layout === 'list' ? colors.primary : colors.muted} size={22} /></Pressable>
      </View>
    </View>
    <FlatList
      key={`catalog-${columns}`} data={cards} numColumns={columns} keyExtractor={(card) => card.id}
      renderItem={({ item }) => layout === 'grid' ? <CardTile card={item} width={(gridWidth - (columns - 1) * 12) / columns} /> : <CardRow card={item} />}
      onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
      columnWrapperStyle={columns > 1 ? styles.gridRow : undefined} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled"
      ListFooterComponent={cards.length ? <Label kind="caption" style={[uiStyles.muted, { paddingTop: 16 }]}>Sample artwork and illustrative USD prices. This catalog is local and does not use live market data.</Label> : null}
      ListEmptyComponent={<EmptyState title="No cards found" message="Try a Pokémon name, set, or collector number." action="Clear search" onPress={() => setQuery('')} icon="search-outline" />}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  toggle: { minWidth: 48, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: '#BFDBFE', backgroundColor: colors.primarySoft },
  gridRow: { gap: 12, marginBottom: 12, alignItems: 'stretch' },
});
