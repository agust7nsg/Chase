import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button, EmptyState, Icon, Label, Screen, SearchField, uiStyles } from '@/components/ui';
import { colors } from '@/theme/tokens';
import type { CatalogSet } from '@/services/tcgdex/types';
import { CatalogTabs } from './CatalogTabs';
import { SetLogo } from './SetLogo';
import { useCatalogSets } from './useCatalogSets';

export function SetsDirectory({ onSearchCards }: { onSearchCards: () => void }) {
  return <SetDirectoryContent onSearchCards={onSearchCards}
    onSelect={set => { if (set) router.push({ pathname: '/search', params: { setId: set.id, setName: set.name, view: 'cards' } }); }} />;
}

export function SetPicker({ selectedId, onSelect, onClose }: { selectedId?: string; onSelect: (set: CatalogSet | null) => void; onClose: () => void }) {
  return <Modal animationType="none" onRequestClose={onClose}>
    <SetDirectoryContent selectedId={selectedId} onSelect={onSelect} onClose={onClose} />
  </Modal>;
}

function SetDirectoryContent({ selectedId, onSelect, onClose, onSearchCards }: {
  selectedId?: string; onSelect: (set: CatalogSet | null) => void; onClose?: () => void; onSearchCards?: () => void;
}) {
  const { sets, loading, error, retry } = useCatalogSets();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => sets.filter(set => `${set.name} ${set.id}`.toLowerCase().includes(query.trim().toLowerCase())), [sets, query]);
  return <Screen scroll={false} safeTop={Boolean(onClose)} style={{ gap: 16, paddingBottom: 0 }}>
    <FlatList data={filtered} keyExtractor={set => set.id} initialNumToRender={10} windowSize={7} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 24 }}
      ListHeaderComponent={<View style={{ gap: 16, paddingBottom: 8 }}>
        <View style={uiStyles.between}><Label kind="title" accessibilityRole="header">{onClose ? 'Choose a set' : 'Card catalog'}</Label>
          {onClose ? <Pressable accessibilityRole="button" accessibilityLabel="Close set filter" onPress={onClose} style={styles.close}><Icon name="close-outline" /></Pressable> : null}</View>
        {onSearchCards ? <CatalogTabs value="sets" onChange={mode => { if (mode === 'cards') onSearchCards(); }} /> : null}
        <SearchField value={query} onChangeText={setQuery} placeholder="Search expansions" accessibilityLabel="Search Pokémon card sets" autoCorrect={false} autoCapitalize="none" />
        <View style={[uiStyles.between, { flexWrap: 'wrap', gap: 8 }]}><Label style={{ fontWeight: '600' }} accessibilityLiveRegion="polite">{loading && !sets.length ? 'Loading sets…' : `${filtered.length}${query.trim() ? ` of ${sets.length}` : ''} sets`}</Label><Label kind="caption" style={uiStyles.muted}>Newest first</Label></View>
        {error && sets.length ? <><Label accessibilityRole="alert" style={uiStyles.muted}>Sets could not be refreshed.</Label><Button title="Retry sets" variant="secondary" onPress={retry} loading={loading} /></> : null}
        {onClose ? <Pressable accessibilityRole="button" accessibilityState={{ selected: !selectedId }} aria-pressed={!selectedId} onPress={() => onSelect(null)} style={styles.row}>
          <View style={styles.allIcon}><Icon name="albums-outline" color={colors.primary} /></View><Label style={{ flex: 1, fontWeight: '600' }}>All sets</Label>{!selectedId ? <Icon name="checkmark" color={colors.primary} /> : null}
        </Pressable> : null}
      </View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${onClose ? 'Filter by' : 'Browse'} ${item.name}`}
        accessibilityState={onClose ? { selected: selectedId === item.id } : undefined} aria-pressed={onClose ? selectedId === item.id : undefined}
        onPress={() => onSelect(item)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}>
        <SetLogo set={item} />
        <View style={{ flex: 1, gap: 4 }}><Label style={{ fontWeight: '600' }}>{item.name}</Label>{item.cardCount ? <Label kind="caption" style={uiStyles.muted}>{item.cardCount.total} cards</Label> : null}</View>
        <Icon name={onClose && selectedId === item.id ? 'checkmark' : 'chevron-forward'} color={onClose && selectedId === item.id ? colors.primary : colors.muted} size={18} />
      </Pressable>}
      ListEmptyComponent={loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading sets" /></View> : error ? <EmptyState title="Sets unavailable" message="Check your connection and try again." action="Try again" onPress={retry} icon="cloud-offline-outline" />
        : <EmptyState title="No sets found" message="Try another expansion name." action="Clear search" onPress={() => setQuery('')} icon="search-outline" />}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  row: { minHeight: 88, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  allIcon: { width: 88, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.primarySoft },
  loading: { paddingVertical: 40, alignItems: 'center' },
});
