import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { OnboardingArtwork } from './OnboardingArtwork';
import { colors } from '@/theme/tokens';
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
    <OnboardingArtwork step={3} />
    <View style={[uiStyles.row, { alignItems: 'flex-start' }]}><Icon name="information-circle-outline" size={20} color={colors.primary} /><Label kind="caption" style={[uiStyles.muted, { flex: 1 }]}>Demo recognition and prices. No camera access. Only a successful result uses your free scan.</Label></View>
    <Button title={state.trial.successfulRecognitions === 0 ? 'Try Free Scan' : 'Continue'} onPress={() => router.push({ pathname: state.trial.successfulRecognitions === 0 ? '/scanner' : '/paywall', params: { onboarding: '1' } })} icon="scan-outline" />
    <Button title="Skip for now" variant="ghost" onPress={() => router.push({ pathname: '/paywall', params: { onboarding: '1' } })} />
  </Screen>;
  const content = steps[step];
  return <Screen style={{ gap: 22 }}>
    <View style={uiStyles.between}><View style={uiStyles.row}><Icon name="layers-outline" color={colors.primary} /><Label kind="heading" style={{ fontWeight: '700' }}>Chase</Label></View><Pressable style={styles.skip} onPress={() => setStep(3)} accessibilityRole="button" accessibilityLabel="Skip"><Label style={uiStyles.muted}>Skip</Label></Pressable></View>
    <OnboardingArtwork step={step as 0 | 1 | 2} />
    <View style={{ gap: 10 }}><Label kind="eyebrow" style={{ color: colors.primary }}>{content.kicker}</Label><Label kind="title">{content.title}</Label><Label style={uiStyles.muted}>{content.description}</Label></View>
    <View style={styles.progress}><View style={styles.dots}>{steps.map((_, i) => <View key={i} accessibilityLabel={`Introduction ${i + 1}${i === step ? ', current' : ''}`} style={[styles.dot, { width: i === step ? 24 : 6, backgroundColor: i === step ? colors.primary : colors.tintBorder }]} />)}</View><Label kind="caption" style={uiStyles.muted}>0{step + 1} / 03</Label></View>
    <Button title={step === 2 ? 'Get started' : 'Continue'} onPress={() => setStep(step + 1)} icon="arrow-forward" />
    {step > 0 ? <Button title="Back" onPress={() => setStep(step - 1)} variant="ghost" /> : <Label kind="caption" style={{ textAlign: 'center', color: colors.muted }}>Yours to explore. No account needed.</Label>}
  </Screen>;
}
const styles = StyleSheet.create({
  skip: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'flex-end' },
  progress: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' }, dot: { height: 6, borderRadius: 3 },
});
