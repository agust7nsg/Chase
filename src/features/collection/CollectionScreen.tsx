import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CardRow, money } from '@/components/CardRow';
import { Badge, Button, EmptyState, Label, Panel, Screen, Section, uiStyles } from '@/components/ui';
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
    <View style={{ gap: 6 }}>
      <Label kind="eyebrow" style={uiStyles.muted}>YOUR CARDS, TOGETHER</Label>
      <Label kind="title" accessibilityRole="header">Collection</Label>
      <Label style={uiStyles.muted}>A home for everything you collect.</Label>
    </View>
    <Panel style={{ backgroundColor: colors.primarySoft, borderColor: '#DBEAFE' }}>
      <View style={[uiStyles.between, { flexWrap: 'wrap' }]}><Label style={uiStyles.muted}>Estimated collection value</Label><Badge>DEMO USD</Badge></View>
      <Label kind="price">{money(summary.totalValue)}</Label>
      <Label kind="caption" style={uiStyles.muted}>Illustrative ungraded prices, not live market values.</Label>
      <View style={styles.stats}>
        <View style={styles.stat}><Label kind="heading">{summary.uniqueCards}</Label><Label kind="caption" style={uiStyles.muted}>Unique cards</Label></View>
        <View style={styles.stat}><Label kind="heading">{summary.totalCopies}</Label><Label kind="caption" style={uiStyles.muted}>Total copies</Label></View>
      </View>
    </Panel>
    <Button title="My Cards" icon="albums-outline" onPress={() => router.push('/my-cards')} />
    <View style={[uiStyles.between, { flexWrap: 'wrap' }]}>
      <Label kind="caption" style={[uiStyles.muted, { flexShrink: 1 }]}>{entitlements.maxCards === null ? 'Unlimited collection · Pro' : `${summary.totalCopies} of ${entitlements.maxCards} free card slots · copies count`}</Label>
      {entitlements.maxCards !== null ? <Button title="Upgrade" variant="ghost" onPress={() => router.push('/paywall')} /> : null}
    </View>
    {persistenceError ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{persistenceError}</Label> : null}
    <View style={{ gap: 4 }}>
      <Section title="Recently added" action={recent.length ? 'View all' : undefined} onPress={() => router.push('/my-cards')} />
      {recent.length ? recent.map((item) => {
        const card = getCatalogCard(item.cardId);
        return card ? <CardRow key={card.id} card={card} quantity={item.quantity} /> : null;
      }) : <EmptyState title="Your collection starts here" message="Find a card in the sample catalog and add your first copy." action="Browse cards" onPress={() => router.push('/search')} />}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#DBEAFE' },
  stat: { flex: 1, gap: 3 },
  loading: { gap: 16, alignItems: 'center', paddingVertical: 48 },
});
