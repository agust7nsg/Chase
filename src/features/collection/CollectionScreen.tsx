import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CardRow, money } from '@/components/CardRow';
import { Badge, Button, EmptyState, Label, Screen, Section, uiStyles } from '@/components/ui';
import { CollectorScene } from '@/components/CollectorScene';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useChase } from '@/features/app/ChaseProvider';
import { colors } from '@/theme/tokens';
export function CollectionScreen() {
  const { state, summary, entitlements, ready, loadError, retryLoad, persistenceError } = useChase();
  if (!ready) return <Screen>{loadError
    ? <EmptyState title="Collection unavailable" message={loadError} action="Try again" onPress={retryLoad} icon="cloud-offline-outline" />
    : <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Label>Loading your collection…</Label></View>}
  </Screen>;
  const recent = [...state.items].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 4);
  return <Screen>
    <View style={{ gap: 6 }}><Label kind="eyebrow" style={{ color: colors.primary }}>YOUR CARD WALLET</Label><Label kind="title" accessibilityRole="header">Collection</Label><Label style={uiStyles.muted}>Your favorites, all together.</Label></View>
    <View style={styles.valueCard}>
      <CollectorScene ids={recent.length ? recent.map(item => item.cardId) : ['base1-4', 'base1-2', 'base1-15']} mood="garden" compact height={164} style={{ marginHorizontal: -24 }} />
      <View style={uiStyles.between}><Label kind="caption" style={uiStyles.muted}>Estimated collection value</Label><Badge tone="neutral">Sample USD</Badge></View>
      <Label kind="price">{money(summary.totalValue)}</Label>
      <View style={styles.stats}>
        <View style={styles.stat}><Label kind="heading" style={styles.statNumber}>{summary.uniqueCards}</Label><Label kind="caption" style={uiStyles.muted}>Unique cards</Label></View>
        <View style={[styles.stat, styles.statDivider]}><Label kind="heading" style={styles.statNumber}>{summary.totalCopies}</Label><Label kind="caption" style={uiStyles.muted}>Total copies</Label></View>
      </View>
    </View>
    <Button title="My Cards" icon="albums-outline" onPress={() => router.push('/my-cards')} />
    {entitlements.maxCards !== null ? <View style={styles.membership}>
      <View style={uiStyles.between}><View style={{ flex: 1, gap: 3 }}><Label kind="caption" style={{ fontWeight: '700' }}>Chase Free</Label><Label kind="caption" style={uiStyles.muted}>{summary.totalCopies} / {entitlements.maxCards} copies</Label></View><Button title="Upgrade" variant="ghost" icon="sparkles-outline" onPress={() => router.push('/paywall')} /></View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Free collection capacity" accessibilityValue={{ min: 0, max: entitlements.maxCards, now: Math.min(summary.totalCopies, entitlements.maxCards) }}><View style={[styles.progress, { width: `${Math.min(1, summary.totalCopies / entitlements.maxCards) * 100}%` }]} /></View>
    </View> : <Badge tone="warm">Unlimited collection · Pro</Badge>}
    {persistenceError ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{persistenceError}</Label> : null}
    <View style={{ gap: 4 }}><Section title="Recently added" action={recent.length ? 'View all' : undefined} onPress={() => router.push('/my-cards')} />
      {recent.length ? recent.map(item => { const card = getCatalogCard(item.cardId); return card ? <CardRow key={card.id} card={card} quantity={item.quantity} /> : null; }) : <EmptyState title="Your collection starts here" message="Find a favorite. Save your first card." action="Browse cards" onPress={() => router.push('/search')} />}
      {recent.length ? <Label kind="caption" style={[uiStyles.muted, { marginTop: 12 }]}>Illustrative prices · USD per copy</Label> : null}
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  valueCard: { gap: 14 },
  stats: { flexDirection: 'row', paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
  stat: { flex: 1, gap: 3 }, statDivider: { paddingLeft: 24, borderLeftWidth: 1, borderLeftColor: colors.border },
  statNumber: { fontSize: 24, lineHeight: 30, fontVariant: ['tabular-nums'] },
  membership: { padding: 16, paddingTop: 8, gap: 8, backgroundColor: colors.primarySoft, borderRadius: 16, borderWidth: 1, borderColor: colors.tintBorder },
  track: { height: 4, backgroundColor: colors.tintBorder, borderRadius: 2, overflow: 'hidden' }, progress: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  loading: { gap: 16, alignItems: 'center', paddingVertical: 48 },
});
