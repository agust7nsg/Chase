import { type ReactNode, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { ChaseBrand } from '@/components/ChaseBrand';
import { OnboardingArtwork } from './OnboardingArtwork';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';

const steps = [
  { label: 'Prices', title: 'Understand card prices', description: 'Look up a specific printing and check its estimated value before you add it.' },
  { label: 'Scanning', title: 'Scan your cards', description: 'Identify a printing, review its price, then choose whether to save a copy.' },
  { label: 'Collection', title: 'Track your collection', description: 'See your cards, manage copies and follow changes in their estimated value.' },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const { state } = useChase();
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const shortLayout = height < 740 || fontScale > 1.5;
  const trialAvailable = state.trial.successfulRecognitions === 0;

  if (step === 3) return <Screen key={step} scroll={shortLayout} style={{ ...styles.screen, paddingBottom: 16 + insets.bottom }}>
    <BrandHeader />
    <OnboardingBody scrollable={!shortLayout}>
    <View style={styles.introduction}><Label kind="eyebrow" style={{ color: colors.primary }}>OPTIONAL · SAMPLE SCAN</Label><Label kind="title" accessibilityRole="header">Try a sample scan</Label><Label style={uiStyles.muted}>{trialAvailable ? 'Free includes one successful sample recognition. Try it now, or keep it for later.' : 'You have already used your complimentary recognition. Continue to review Chase Pro or return to the app.'}</Label></View>
    <OnboardingArtwork step={3} />
    <View style={styles.explanation}><Icon name="information-circle-outline" size={20} color={colors.primary} /><Label kind="caption" style={[uiStyles.muted, { flex: 1 }]}>Demo recognition and sample USD prices. No camera access. Canceled or failed scans never use your allowance.</Label></View>
    <Label kind="caption" style={styles.footerNote}>No account required. Your collection stays on this device.</Label>
    </OnboardingBody>
    <View style={styles.actions}><Button title={trialAvailable ? 'Try Free Scan' : 'Continue'} onPress={() => router.push({ pathname: trialAvailable ? '/scanner' : '/paywall', params: { onboarding: '1' } })} icon={trialAvailable ? 'scan-outline' : 'arrow-forward'} /><Button title="Skip for now" variant="ghost" onPress={() => router.push({ pathname: '/paywall', params: { onboarding: '1' } })} /></View>
  </Screen>;

  const content = steps[step];
  return <Screen key={step} scroll={shortLayout} style={{ ...styles.screen, paddingBottom: 16 + insets.bottom }}>
    <BrandHeader onSkip={() => setStep(3)} />
    <OnboardingBody scrollable={!shortLayout}>
    <View style={styles.introduction}><Label kind="eyebrow" style={{ color: colors.primary }}>{content.label.toUpperCase()}</Label><Label kind="title" accessibilityRole="header">{content.title}</Label><Label style={uiStyles.muted}>{content.description}</Label></View>
    <OnboardingArtwork step={step as 0 | 1 | 2} />
    {step < 2 ? <Label kind="caption" style={uiStyles.muted}>{step === 0 ? 'Prototype prices are illustrative USD estimates, not live quotes or guaranteed resale values.' : 'Recognition is simulated in this prototype. A card is saved only after you confirm.'}</Label> : null}
    {step === 0 ? <Label kind="caption" style={styles.footerNote}>Browse and collect without creating an account.</Label> : null}
    </OnboardingBody>
    <View style={styles.footer}>
    <View style={styles.progress} accessible accessibilityLabel={`Introduction ${step + 1} of 3. ${content.label}.`}>
      <View style={styles.progressTracks}>{steps.map((_, index) => <View key={index} style={[styles.progressTrack, index <= step && { backgroundColor: colors.primary }]} />)}</View><Label kind="caption" style={uiStyles.muted}>0{step + 1} / 03</Label>
    </View>
    <View style={styles.actions}><Button title={step === 2 ? 'Get started' : 'Continue'} onPress={() => setStep(step + 1)} icon="arrow-forward" />
      {step > 0 ? <Button title="Back" onPress={() => setStep(step - 1)} variant="ghost" /> : null}
    </View>
    </View>
  </Screen>;
}

function OnboardingBody({ children, scrollable }: { children: ReactNode; scrollable: boolean }) {
  return scrollable ? <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>{children}</ScrollView> : <View style={styles.bodyContent}>{children}</View>;
}

function BrandHeader({ onSkip }: { onSkip?: () => void }) {
  return <View style={[uiStyles.between, { minHeight: 48 }]}><ChaseBrand />{onSkip ? <Pressable style={({ pressed }) => [styles.skip, pressed && { opacity: 0.6 }]} onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip"><Label style={uiStyles.muted}>Skip</Label></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  screen: { gap: 24 },
  body: { flex: 1 },
  bodyContent: { gap: 24, paddingBottom: 16 },
  footer: { gap: 16 },
  skip: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'flex-end' },
  introduction: { gap: 10 },
  explanation: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  progress: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 24 },
  progressTracks: { flexDirection: 'row', gap: 6, flex: 1, maxWidth: 112 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.tintBorder },
  actions: { gap: 8 },
  footerNote: { textAlign: 'center', color: colors.muted, paddingVertical: 6 },
});
