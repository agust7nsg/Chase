import { router } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Badge, Button, Icon, Label, Screen, Section, uiStyles } from '@/components/ui';
import { CardPrint } from '@/components/CardPrint';
import { CardRow } from '@/components/CardRow';
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
  const { state, featuredCardId } = useChase();
  const { fontScale } = useWindowDimensions();
  const startScan = () => router.push(canScan(state) ? '/scanner' : '/paywall');
  const recent = [...state.items].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 3);
  const featuredCard = getCatalogCard(featuredCardId)!;

  return <Screen>
    <View style={uiStyles.between}>
      <ChaseBrand />
      <Badge tone={state.plan === 'pro' ? 'warm' : 'neutral'}>{state.plan === 'pro' ? 'Pro · demo' : 'Free'}</Badge>
    </View>

    <View style={styles.findSection}>
      <View style={styles.scanHero}>
        <View pointerEvents="none" style={styles.heroOrbit} accessible={false} />
        <View style={[styles.heroStory, fontScale > 1.3 && styles.heroStoryLarge]}>
          <View style={[styles.heroCopy, fontScale > 1.3 && { width: '100%' }]}>
            <Label kind="eyebrow" style={styles.heroEyebrow}>POKÉMON TCG</Label>
            <Label accessibilityRole="header" style={styles.heroTitle}>Scan a{ '\n' }card.</Label>
          </View>
          <View style={styles.heroPrint}>
            <View pointerEvents="none" style={styles.printOffset} accessible={false} />
            <CardPrint card={featuredCard} />
          </View>
        </View>
        <Button title="Scan a Card" variant="inverse" icon="scan-outline" onPress={startScan} />
        <View pointerEvents="none" accessible={false} style={{ height: 19 * fontScale }} />
      </View>
      <Button title="Search Cards" variant="secondary" icon="search-outline" onPress={() => router.push('/search')} />
    </View>

    {recent.length > 0 ? <View style={{ gap: 8 }}><Section title="Recently added" />{recent.map(item => { const card = getCatalogCard(item.cardId); return card ? <CardRow key={card.id} card={card} quantity={item.quantity} /> : null; })}</View> : null}

    <View style={{ gap: 8 }}>
      <Section title="Browse by set" action="All cards" onPress={() => router.push('/search')} />
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
  findSection: { gap: 16 },
  scanHero: { marginHorizontal: -24, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16, gap: 12, backgroundColor: colors.heroBlue, overflow: 'hidden' },
  heroStory: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 206, paddingBottom: 12 },
  heroStoryLarge: { flexDirection: 'column', gap: 20, alignItems: 'flex-start' },
  heroCopy: { width: '49%', gap: 12 },
  heroEyebrow: { color: colors.heroQuiet, fontSize: 10, lineHeight: 16, letterSpacing: 1.3 },
  heroTitle: { fontSize: 40, lineHeight: 43, fontWeight: '700', letterSpacing: -1.3, color: colors.white },
  heroPrint: { width: '43%', maxWidth: 164, alignSelf: 'center', transform: [{ rotate: '8deg' }], shadowColor: colors.scanner, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 5 },
  printOffset: { position: 'absolute', top: -10, bottom: 10, left: -10, right: 10, borderWidth: 1, borderColor: colors.onPrimaryMuted, borderRadius: 8, opacity: 0.45 },
  heroOrbit: { position: 'absolute', top: -45, right: -76, width: 300, height: 300, borderRadius: 150, backgroundColor: colors.primaryDeep },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.border },
  setPrint: { width: 56 },
  pressed: { opacity: 0.65 },
});
