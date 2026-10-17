import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Icon, Label, Screen, Section, uiStyles } from '@/components/ui';
import { CardPrint } from '@/components/CardPrint';
import { CardRow, money } from '@/components/CardRow';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';
import { catalog, getCatalogCard } from '@/data/mocks/catalog';
import { canScan } from '@/services';
import { ChaseBrand } from '@/components/ChaseBrand';

const sets = [
  { name: 'Evolving Skies', cardId: 'swsh7-215' },
  { name: 'Lost Origin', cardId: 'swsh11-186' },
];

export default function HomeScreen() {
  const { state, summary } = useChase();
  const startScan = () => router.push(canScan(state) ? '/scanner' : '/paywall');
  const recent = [...state.items].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 3);
  const scanStatus = state.plan === 'pro'
    ? 'Unlimited sample scans · Pro simulation'
    : state.trial.successfulRecognitions === 0
      ? '1 complimentary sample scan available'
      : 'Complimentary sample scan used · Pro preview available';

  return <Screen>
    <View style={uiStyles.between}>
      <ChaseBrand />
      <Badge tone={state.plan === 'pro' ? 'warm' : 'neutral'}>{state.plan === 'pro' ? 'Pro · demo' : 'Free'}</Badge>
    </View>

    <View style={styles.findSection}>
      <Label kind="title" accessibilityRole="header">Find a card</Label>
      <Label style={uiStyles.muted}>Identify a printing and check its estimated price.</Label>
      <Pressable accessibilityRole="button" accessibilityLabel="Scan a Card" onPress={startScan} style={({ pressed }) => [styles.scanAction, pressed && styles.pressed]}>
        <View style={styles.scanIcon}><Icon name="scan-outline" color={colors.white} size={33} /></View>
        <View style={{ flex: 1, gap: 4 }}><Label kind="heading" style={{ color: colors.white }}>Scan a Card</Label><Label kind="caption" style={{ color: colors.onPrimaryMuted }}>Sample recognition · no camera</Label></View>
        <Icon name="arrow-forward" color={colors.white} size={23} />
      </Pressable>
      <Button title="Search Cards" variant="secondary" icon="search-outline" onPress={() => router.push('/search')} />
      <Label kind="caption" style={uiStyles.muted}>{scanStatus}</Label>
    </View>

    <View style={styles.walletSection}>
      <Section title="Your collection" action="View all" onPress={() => router.push('/(tabs)/collection')} />
      <Pressable accessibilityRole="button" accessibilityLabel="Open your collection" onPress={() => router.push('/(tabs)/collection')} style={({ pressed }) => [styles.wallet, pressed && styles.pressed]}>
        <View style={{ flex: 1, gap: 6 }}>
          <Label kind="caption" style={uiStyles.muted}>Estimated value · USD</Label>
          <Label kind="price">{money(summary.totalValue)}</Label>
          <Label kind="caption" style={uiStyles.muted}>{summary.totalCopies ? `${summary.uniqueCards} printings · ${summary.totalCopies} saved copies` : 'No saved cards yet'}</Label>
        </View>
        <View style={styles.walletArrow}><Icon name="arrow-forward" color={colors.primary} /></View>
      </Pressable>
      <Label kind="caption" style={uiStyles.muted}>{summary.totalCopies ? 'Sample prices, including every saved copy.' : 'Add cards from search or confirm a sample scan.'}</Label>
    </View>

    {recent.length > 0 ? <View style={{ gap: 8 }}><Section title="Recently added" />{recent.map(item => { const card = getCatalogCard(item.cardId); return card ? <CardRow key={card.id} card={card} quantity={item.quantity} /> : null; })}</View> : null}

    <View style={{ gap: 8 }}>
      <Section title="Browse by set" action="All cards" onPress={() => router.push('/search')} />
      <Label kind="caption" style={uiStyles.muted}>Explore the bundled card catalog. Prices are illustrative.</Label>
      {sets.map(set => {
        const card = getCatalogCard(set.cardId)!;
        const printings = catalog.filter(item => item.setName === set.name).length;
        return <Pressable key={set.name} accessibilityRole="button" accessibilityLabel={`Browse ${set.name}, ${printings} printings`} onPress={() => router.push({ pathname: '/search', params: { query: set.name } })} style={({ pressed }) => [styles.setRow, pressed && styles.pressed]}>
          <View style={styles.setPrint}><CardPrint card={card} /></View>
          <View style={{ flex: 1, gap: 5 }}><Label style={{ fontWeight: '600' }}>{set.name}</Label><Label kind="caption" style={uiStyles.muted}>{printings} {printings === 1 ? 'printing' : 'printings'}</Label></View>
          <Icon name="chevron-forward" color={colors.muted} size={19} />
        </Pressable>;
      })}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  findSection: { gap: 12, paddingTop: 8 },
  scanAction: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, minHeight: 104, borderRadius: 18, backgroundColor: colors.primary, marginTop: 8 },
  scanIcon: { width: 42, alignItems: 'center', justifyContent: 'center' },
  walletSection: { gap: 6, paddingTop: 4 },
  wallet: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 },
  walletArrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.border },
  setPrint: { width: 56 },
  pressed: { opacity: 0.65 },
});
