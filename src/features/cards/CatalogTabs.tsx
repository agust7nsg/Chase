import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Label } from '@/components/ui';
import { colors } from '@/theme/tokens';

export function CatalogTabs({ value, onChange }: { value: 'sets' | 'cards'; onChange: (mode: 'sets' | 'cards') => void }) {
  return <View role="tablist" accessibilityLabel="Catalog content" style={styles.tabs}>
    {(['sets', 'cards'] as const).map(mode => <Pressable key={mode} accessibilityRole="tab" accessibilityLabel={mode === 'sets' ? 'Browse sets' : 'Search cards'}
      accessibilityState={{ selected: value === mode }} aria-selected={value === mode} onPress={() => onChange(mode)}
      style={({ pressed }) => [styles.tab, value === mode && styles.active, pressed && { opacity: 0.65 }]}>
      <Icon name={mode === 'sets' ? 'layers-outline' : 'search-outline'} size={18} color={value === mode ? colors.primary : colors.muted} />
      <Label style={{ color: value === mode ? colors.primary : colors.muted, fontWeight: '600' }}>{mode === 'sets' ? 'Sets' : 'Cards'}</Label>
    </Pressable>)}
  </View>;
}
const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: 14, backgroundColor: colors.subtle },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, minHeight: 48, padding: 10, borderRadius: 10 },
  active: { backgroundColor: colors.white },
});
