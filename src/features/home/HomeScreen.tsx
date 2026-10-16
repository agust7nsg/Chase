import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Icon, Label, Screen, Section, uiStyles } from '@/components/ui';
import { CollectorScene } from '@/components/CollectorScene';
import { CardPrint } from '@/components/CardPrint';
import { CardRow, money } from '@/components/CardRow';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';
import { catalog, getCatalogCard } from '@/data/mocks/catalog';
import { canScan } from '@/services';

const editorials = [
  { id: 'swsh11-186', title: 'Another world.', caption: 'Lost Origin · alternate art' },
  { id: 'sv2-203', title: 'A small legend.', caption: 'Paldea Evolved · illustration rare' },
];
export default function HomeScreen() {
  const { state, summary } = useChase();
  const startScan = () => router.push(canScan(state) ? '/scanner' : '/paywall');
  const recent = [...state.items].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 3);
  return <Screen>
    <View style={uiStyles.between}>
      <View style={uiStyles.row}><View style={styles.logo}><Icon name="layers-outline" color={colors.white} /></View><Label kind="heading" style={styles.wordmark}>Chase</Label></View>
      <Badge tone={state.plan === 'pro' ? 'warm' : 'neutral'}>{state.plan === 'pro' ? 'Pro · demo' : 'Free'}</Badge>
    </View>
    <View style={{ gap: 6 }}><Label kind="eyebrow" style={{ color: colors.primary }}>THE COLLECTOR IN YOU</Label><Label kind="title">Your next great find.</Label><Label style={uiStyles.muted}>Some cards just stay with you.</Label></View>
    <View style={styles.hero}>
      <CollectorScene ids={['swsh7-215', 'swsh12-186', 'swsh7-218']} mood="moon" height={240} />
      <View style={styles.heroCopy}>
        <View style={uiStyles.between}><View style={{ flex: 1, gap: 3 }}><Label kind="heading">The thrill of the find.</Label><Label kind="caption" style={uiStyles.muted}>{state.plan === 'pro' ? 'Pro access · sample scans' : state.trial.successfulRecognitions === 0 ? 'Your first sample scan is on us.' : 'Keep discovering with Chase Pro.'}</Label></View><Icon name="scan-outline" color={colors.primary} size={28} /></View>
        <Button title="Scan a Card" icon="scan-outline" onPress={startScan} />
        <Label kind="caption" style={[uiStyles.muted, { textAlign: 'center' }]}>Demo recognition · no camera access</Label>
      </View>
    </View>
    <Button title="Search Cards" variant="secondary" icon="search-outline" onPress={() => router.push('/search')} />
    <View style={{ gap: 12 }}><Section title="Your collection" action="View all" onPress={() => router.push('/(tabs)/collection')} />
      <Pressable accessibilityRole="button" accessibilityLabel={summary.totalCopies ? 'Open your collection' : 'Browse cards'} onPress={() => router.push(summary.totalCopies ? '/(tabs)/collection' : '/search')} style={({ pressed }) => [styles.wallet, pressed && { opacity: 0.65 }]}>
        <View style={styles.walletPrint}><CardPrint card={getCatalogCard(recent[0]?.cardId ?? 'base1-4') ?? catalog[0]} /></View>
        <View style={{ flex: 1, gap: 4 }}><Label kind="caption" style={uiStyles.muted}>{summary.totalCopies ? 'Estimated value · sample USD' : 'YOUR STORY STARTS HERE'}</Label><Label kind={summary.totalCopies ? 'heading' : 'body'} style={{ fontWeight: '700' }}>{summary.totalCopies ? money(summary.totalValue) : 'Your first card awaits'}</Label><Label kind="caption" style={uiStyles.muted}>{summary.totalCopies ? `${summary.uniqueCards} unique cards · ${summary.totalCopies} copies` : 'Find a favorite. Make it yours.'}</Label></View><Icon name="arrow-forward" color={colors.primary} />
      </Pressable>
    </View>
    <View style={{ gap: 12 }}><Section title="The collector’s edit" /><Label kind="caption" style={uiStyles.muted}>A closer look at extraordinary card art.</Label>
      {editorials.map(edit => { const card = getCatalogCard(edit.id)!; return <Pressable key={card.id} accessibilityRole="button" accessibilityLabel={`Explore ${card.name}, ${card.setName}`} onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })} style={({ pressed }) => [styles.editorial, pressed && { opacity: 0.65 }]}>
        <View style={styles.editorialPrint}><CardPrint card={card} /></View>
        <View style={{ flex: 1, gap: 6 }}><Label kind="eyebrow" style={{ color: colors.primary }}>{card.name}</Label><Label kind="heading">{edit.title}</Label><Label kind="caption" style={uiStyles.muted}>{edit.caption}</Label><View style={[uiStyles.row, { marginTop: 6 }]}><Label kind="caption" style={{ color: colors.primary, fontWeight: '700' }}>Explore card</Label><Icon name="arrow-forward" size={16} color={colors.primary} /></View></View>
      </Pressable>; })}
    </View>
    {recent.length > 0 ? <View><Section title="Recently added" />{recent.map(item => { const card = getCatalogCard(item.cardId); return card ? <CardRow key={card.id} card={card} quantity={item.quantity} /> : null; })}<Label kind="caption" style={[uiStyles.muted, { marginTop: 12 }]}>Illustrative prices · USD per copy</Label></View> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  logo: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  wordmark: { fontSize: 25, fontWeight: '700', letterSpacing: -0.8 },
  hero: { marginHorizontal: -24 }, heroCopy: { paddingHorizontal: 24, gap: 14, paddingTop: 18 },
  wallet: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  walletPrint: { width: 48, transform: [{ rotate: '-6deg' }] },
  editorial: { flexDirection: 'row', alignItems: 'center', gap: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  editorialPrint: { width: '32%', maxWidth: 120, transform: [{ rotate: '-4deg' }] },
});
