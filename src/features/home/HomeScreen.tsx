import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Badge, Button, EmptyState, Icon, Label, Panel, Screen, Section, uiStyles } from '@/components/ui';
import { CardIllustration } from '@/components/CardArtwork';
import { CardRow, money } from '@/components/CardRow';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';
import { catalog } from '@/data/mocks/catalog';
import { canScan } from '@/services';
export default function HomeScreen() {
  const { state, summary } = useChase();
  const startScan = () => router.push(canScan(state) ? '/scanner' : '/paywall');
  const recent = [...state.items].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 3);
  return <Screen>
    <View style={uiStyles.between}>
      <View style={uiStyles.row}><View style={styles.logo}><Icon name="layers-outline" color={colors.white} /></View><Label kind="heading" style={{ fontSize: 25, fontWeight: '700', letterSpacing: -0.8 }}>Chase</Label></View>
      <Badge tone={state.plan === 'pro' ? 'warm' : 'neutral'}>{state.plan === 'pro' ? 'Pro · demo' : 'Free'}</Badge>
    </View>
    <View style={{ gap: 6 }}><Label kind="eyebrow" style={uiStyles.muted}>THE COLLECTOR IN YOU</Label><Label kind="title">Your next great find.</Label></View>
    <View style={styles.hero}>
      <View style={[uiStyles.row, { alignItems: 'center' }]}>
        <View style={{ flex: 1, gap: 10 }}><View style={styles.scanIcon}><Icon name="scan-outline" color={colors.white} size={24} /></View><Label style={styles.heroTitle}>Find your next chase.</Label></View>
        <View style={styles.heroArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><View style={styles.heroBack} /><View style={styles.miniCard}><CardIllustration card={catalog[0]} /><View style={{ height: 3, width: '60%', borderRadius: 2, backgroundColor: colors.tintBorder }} /></View></View>
      </View>
      <Label style={{ color: colors.onPrimaryMuted }}>{state.plan === 'pro' ? 'Pro access · sample scans' : state.trial.successfulRecognitions === 0 ? 'Your first sample scan is on us.' : 'Keep discovering with Chase Pro.'}</Label>
      <Button title="Scan a Card" icon="scan-outline" variant="inverse" onPress={startScan} />
      <Label kind="caption" style={{ color: colors.onPrimaryMuted, textAlign: 'center' }}>Demo recognition · no camera access</Label>
    </View>
    <Button title="Search Cards" variant="secondary" icon="search-outline" onPress={() => router.push('/search')} />
    <View style={{ gap: 8 }}><Section title="Your collection" action="View all" onPress={() => router.push('/(tabs)/collection')} />
      {summary.totalCopies > 0 ? <Panel><View style={uiStyles.between}><Label kind="caption" style={uiStyles.muted}>Estimated value</Label><Badge tone="neutral">Sample USD</Badge></View><Label kind="price">{money(summary.totalValue)}</Label><Label kind="caption" style={uiStyles.muted}>{summary.uniqueCards} unique cards · {summary.totalCopies} copies</Label></Panel> : <EmptyState title="Your first card awaits" message="Start with a favorite. Make it your collection." action="Browse cards" onPress={() => router.push('/search')} />}
    </View>
    {recent.length > 0 ? <View><Section title="Recently added" />{recent.map(item => { const card = catalog.find(c => c.id === item.cardId); return card ? <CardRow key={card.id} card={card} quantity={item.quantity} /> : null; })}<Label kind="caption" style={[uiStyles.muted, { marginTop: 12 }]}>Sample artwork & prices · USD per copy</Label></View> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  logo: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  hero: { padding: 22, gap: 16, borderRadius: 24, backgroundColor: colors.primary },
  heroTitle: { color: colors.white, fontSize: 27, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  scanIcon: { width: 44, height: 44, backgroundColor: colors.primaryDeep, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroArt: { width: 92, marginHorizontal: 4 },
  heroBack: { position: 'absolute', top: 0, bottom: 0, left: -5, right: 0, backgroundColor: colors.primaryDeep, borderRadius: 10, transform: [{ rotate: '-12deg' }] },
  miniCard: { padding: 8, backgroundColor: colors.white, borderRadius: 10, gap: 10, transform: [{ rotate: '9deg' }] },
});
