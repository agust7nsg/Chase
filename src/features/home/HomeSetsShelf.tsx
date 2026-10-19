import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Label, Section, uiStyles } from '@/components/ui';
import { SetLogo } from '@/features/cards/SetLogo';
import { useCatalogSets } from '@/features/cards/useCatalogSets';
import { colors } from '@/theme/tokens';

export function HomeSetsShelf() {
  const { sets, loading, error, retry } = useCatalogSets();
  const { fontScale } = useWindowDimensions();
  return <View style={{ gap: 8 }}>
    <Section title="Browse by set" action="See all" onPress={() => router.push('/search')} />
    {sets.length ? <>
      <Label kind="caption" style={uiStyles.muted}>{sets.length} expansions · Newest first</Label>
      <FlatList horizontal data={sets} keyExtractor={set => set.id} initialNumToRender={4} windowSize={5} showsHorizontalScrollIndicator={false}
        accessibilityLabel="Pokémon TCG expansions" contentContainerStyle={{ gap: 12, paddingVertical: 8 }}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Browse ${item.name}`}
          onPress={() => router.push({ pathname: '/search', params: { view: 'cards', setId: item.id, setName: item.name } })}
          style={({ pressed }) => [styles.set, { width: fontScale > 1.3 ? 176 : 144 }, pressed && { opacity: 0.65 }]}>
          <SetLogo set={item} width={112} height={64} />
          <Label style={{ fontWeight: '600', textAlign: 'center' }}>{item.name}</Label>
        </Pressable>} />
    </> : loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading expansions" /> : error ? <><Label kind="caption" style={uiStyles.muted}>Expansions could not be loaded.</Label><Button title="Retry sets" variant="secondary" onPress={retry} /></> : <Button title="Browse expansions" variant="secondary" onPress={() => router.push('/search')} />}
  </View>;
}
const styles = StyleSheet.create({
  set: { alignItems: 'center', justifyContent: 'flex-start', padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.white },
});
