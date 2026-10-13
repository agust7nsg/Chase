import { router } from 'expo-router';
import { View } from 'react-native';
import { Badge, Button, EmptyState, Icon, Label, Panel, Screen, Section, uiStyles } from '@/components/ui';
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
    <View style={uiStyles.between}><View style={uiStyles.row}><View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}><Icon name="layers-outline" color={colors.white} /></View><Label kind="heading" style={{ fontSize: 26 }}>Chase</Label></View><Badge>{state.plan === 'pro' ? 'Pro · simulated' : 'Free collector'}</Badge></View>
    <View style={{ gap: 10, paddingTop: 16 }}><Label kind="eyebrow" style={uiStyles.muted}>YOUR NEXT GREAT FIND</Label><Label kind="title">Every card has{`\n`}a story.</Label><Label style={uiStyles.muted}>Discover your cards. Keep your collection close.</Label></View>
    <Panel style={{ backgroundColor: colors.primarySoft, borderColor: '#DBEAFE', gap: 20 }}>
      <View style={uiStyles.row}><Icon name="scan-outline" size={30} color={colors.primary} /><View style={{ flex: 1, gap: 4 }}><Label kind="heading">Find your next chase</Label><Label kind="caption" style={uiStyles.muted}>{state.plan === 'pro' ? 'Development Pro access · simulated scanner' : state.trial.successfulRecognitions === 0 ? 'Your complimentary sample scan is waiting.' : 'Explore Chase Pro to keep scanning.'}</Label></View></View>
      <Button title="Scan a Card" icon="scan-outline" onPress={startScan} />
      <Label kind="caption" style={uiStyles.muted}>Prototype scanner · no camera or real recognition</Label>
    </Panel>
    <Button title="Search Cards" variant="secondary" icon="search-outline" onPress={() => router.push('/search')} />
    <View style={{ gap: 4 }}><Section title="Your collection" action="View all" onPress={() => router.push('/(tabs)/collection')} />
      {summary.totalCopies > 0 ? <Panel><Label kind="caption" style={uiStyles.muted}>ESTIMATED VALUE · DEMO PRICES</Label><Label kind="price">{money(summary.totalValue)}</Label><Label style={uiStyles.muted}>{summary.uniqueCards} unique cards · {summary.totalCopies} total copies</Label></Panel> : <EmptyState title="A collection starts with one card" message="Save a sample scan or find a favorite in the catalog." action="Browse cards" onPress={() => router.push('/search')} />}
    </View>
    {recent.length > 0 ? <View><Section title="Recently added" />{recent.map(item => { const card = catalog.find(c => c.id === item.cardId); return card ? <CardRow key={card.id} card={card} quantity={item.quantity} /> : null; })}</View> : null}
  </Screen>;
}
