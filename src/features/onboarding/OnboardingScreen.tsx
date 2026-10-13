import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { CardStage, CardArtwork } from '@/components/CardArtwork';
import { colors } from '@/theme/tokens';
import { catalog } from '@/data/mocks/catalog';
import { useChase } from '@/features/app/ChaseProvider';
const steps = [
  { kicker: 'FOR THE CARDS YOU LOVE', title: 'Welcome to Chase', description: 'Find your favorites. Build something worth keeping.' },
  { kicker: 'A CLOSER LOOK', title: 'Scan Your Cards', description: 'Discover a card, explore its value, and find your next favorite.' },
  { kicker: 'EVERY FAVORITE, TOGETHER', title: 'Build Your Collection', description: 'Your cards, your copies, your collection. All in one place.' },
];
export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const { state } = useChase();
  if (step === 3) return <Screen>
    <Badge>ONE FREE SAMPLE SCAN</Badge><Label kind="title">Your first find{`\n`}is on us.</Label>
    <Label style={uiStyles.muted}>Try a sample scan now, or save it for later.</Label>
    <CardStage card={catalog[0]} compact />
    <View style={[uiStyles.row, { alignItems: 'flex-start' }]}><Icon name="information-circle-outline" size={20} color={colors.primary} /><Label kind="caption" style={[uiStyles.muted, { flex: 1 }]}>Demo recognition and prices. No camera access. Only a successful result uses your free scan.</Label></View>
    <Button title={state.trial.successfulRecognitions === 0 ? 'Try Free Scan' : 'Continue'} onPress={() => router.push({ pathname: state.trial.successfulRecognitions === 0 ? '/scanner' : '/paywall', params: { onboarding: '1' } })} icon="scan-outline" />
    <Button title="Skip for now" variant="ghost" onPress={() => router.push({ pathname: '/paywall', params: { onboarding: '1' } })} />
  </Screen>;
  const content = steps[step];
  return <Screen style={{ gap: 22 }}>
    <View style={uiStyles.between}><View style={uiStyles.row}><Icon name="layers-outline" color={colors.primary} /><Label kind="heading" style={{ fontWeight: '700' }}>Chase</Label></View><Pressable style={styles.skip} onPress={() => setStep(3)} accessibilityRole="button" accessibilityLabel="Skip"><Label style={uiStyles.muted}>Skip</Label></Pressable></View>
    {step === 2 ? <View style={styles.walletVisual}>
      <View style={uiStyles.between}><Icon name="albums-outline" color={colors.primary} /><Label kind="eyebrow" style={{ color: colors.primary }}>YOUR COLLECTION</Label></View>
      <View style={{ flexDirection: 'row', gap: 12 }}>{[catalog[1], catalog[4]].map(card => <View key={card.id} style={{ flex: 1, gap: 8 }}><CardArtwork card={card} compact /><Label style={{ fontWeight: '600' }}>{card.name}</Label></View>)}</View>
      <View style={styles.walletFooter}><Icon name="checkmark-circle" color={colors.primary} size={18} /><Label kind="caption" style={uiStyles.muted}>A place for every favorite</Label></View>
    </View> : <View><CardStage card={step === 0 ? catalog[0] : catalog[2]} compact />{step === 1 ? <View style={styles.scanHint}><Icon name="scan-outline" size={18} color={colors.primary} /><Label kind="caption" style={{ color: colors.primary, fontWeight: '600' }}>Discover in a scan · demo</Label></View> : null}</View>}
    <View style={{ gap: 10 }}><Label kind="eyebrow" style={{ color: colors.primary }}>{content.kicker}</Label><Label kind="title">{content.title}</Label><Label style={uiStyles.muted}>{content.description}</Label></View>
    <View style={styles.progress}><View style={styles.dots}>{steps.map((_, i) => <View key={i} accessibilityLabel={`Introduction ${i + 1}${i === step ? ', current' : ''}`} style={[styles.dot, { width: i === step ? 24 : 6, backgroundColor: i === step ? colors.primary : colors.tintBorder }]} />)}</View><Label kind="caption" style={uiStyles.muted}>0{step + 1} / 03</Label></View>
    <Button title={step === 2 ? 'Get started' : 'Continue'} onPress={() => setStep(step + 1)} icon="arrow-forward" />
    {step > 0 ? <Button title="Back" onPress={() => setStep(step - 1)} variant="ghost" /> : <Label kind="caption" style={{ textAlign: 'center', color: colors.muted }}>Yours to explore. No account needed.</Label>}
  </Screen>;
}
const styles = StyleSheet.create({
  skip: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'flex-end' },
  walletVisual: { padding: 20, borderRadius: 24, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.tintBorder, gap: 20 },
  walletFooter: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderColor: colors.tintBorder },
  scanHint: { alignSelf: 'center', marginTop: -20, backgroundColor: colors.white, borderColor: colors.tintBorder, borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  progress: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' }, dot: { height: 6, borderRadius: 3 },
});
