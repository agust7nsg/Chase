import { type ReactNode, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Label, Screen, uiStyles } from '@/components/ui';
import { ChaseBrand } from '@/components/ChaseBrand';
import { OnboardingArtwork } from './OnboardingArtwork';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';

const steps = [
  { label: 'Prices', title: 'Card prices', description: 'Find the price of your printing.' },
  { label: 'Scanning', title: 'Scan a card', description: 'Identify it. Check the price. Save it.' },
  { label: 'Collection', title: 'Your collection', description: 'Your cards. Their value over time.' },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const { state } = useChase();
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const shortLayout = height < 740 || fontScale > 1.5;
  const compact = height < 740 && fontScale <= 1.2;
  const screenStyle = { ...styles.screen, ...(compact ? styles.compactScreen : {}), paddingBottom: (compact ? 12 : 16) + insets.bottom };
  const trialAvailable = state.trial.successfulRecognitions === 0;

  if (step === 3) return <Screen key={step} scroll={shortLayout} style={screenStyle}>
    <BrandHeader />
    <OnboardingBody scrollable={!shortLayout} compact={compact}>
      <View style={styles.introduction}>
        <Label kind="title" accessibilityRole="header">Try one scan</Label>
        <Label style={uiStyles.muted}>{trialAvailable ? 'One free demo. No camera needed.' : 'Your free scan has been used.'}</Label>
      </View>
      <OnboardingArtwork step={3} />
    </OnboardingBody>
    <View style={styles.actions}>
      <Button title={trialAvailable ? 'Try Free Scan' : 'Continue'} onPress={() => router.push({ pathname: trialAvailable ? '/scanner' : '/paywall', params: { onboarding: '1' } })} icon={trialAvailable ? 'scan-outline' : 'arrow-forward'} />
      <Button title="Skip for now" variant="ghost" onPress={() => router.push({ pathname: '/paywall', params: { onboarding: '1' } })} />
    </View>
  </Screen>;

  const content = steps[step];
  return <Screen key={step} scroll={shortLayout} style={screenStyle}>
    <BrandHeader onSkip={() => setStep(3)} />
    <OnboardingBody scrollable={!shortLayout} compact={compact}>
      <View style={styles.introduction}>
        <Label kind="title" accessibilityRole="header">{content.title}</Label>
        <Label style={uiStyles.muted}>{content.description}</Label>
      </View>
      <OnboardingArtwork step={step as 0 | 1 | 2} />
    </OnboardingBody>
    <View style={[styles.footer, compact && { gap: 8 }]}>
      <View style={styles.progress} accessible accessibilityLabel={`Introduction ${step + 1} of 3. ${content.label}.`}>
        {steps.map((_, index) => <View key={index} style={[styles.progressTrack, index === step && styles.progressActive]} />)}
      </View>
      <View style={styles.actions}>
        <Button title={step === 2 ? 'Get started' : 'Continue'} onPress={() => setStep(step + 1)} icon="arrow-forward" />
        {step > 0 ? <Button title="Back" onPress={() => setStep(step - 1)} variant="ghost" /> : null}
      </View>
    </View>
  </Screen>;
}

function OnboardingBody({ children, scrollable, compact }: { children: ReactNode; scrollable: boolean; compact: boolean }) {
  const contentStyle = [styles.bodyContent, compact && { gap: 12, paddingBottom: 0 }];
  return scrollable
    ? <ScrollView style={styles.body} contentContainerStyle={contentStyle}>{children}</ScrollView>
    : <View style={contentStyle}>{children}</View>;
}

function BrandHeader({ onSkip }: { onSkip?: () => void }) {
  return <View style={[uiStyles.between, { minHeight: 48 }]}>
    <ChaseBrand />
    {onSkip ? <Pressable style={({ pressed }) => [styles.skip, pressed && { opacity: 0.6 }]} onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip"><Label style={uiStyles.muted}>Skip</Label></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { gap: 20 },
  compactScreen: { gap: 12, paddingTop: 16 },
  body: { flex: 1 },
  bodyContent: { gap: 20, paddingBottom: 8 },
  footer: { gap: 16 },
  skip: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'flex-end' },
  introduction: { gap: 6 },
  progress: { flexDirection: 'row', alignSelf: 'center', gap: 6, height: 4 },
  progressTrack: { width: 7, height: 4, borderRadius: 2, backgroundColor: colors.tintBorder },
  progressActive: { width: 24, backgroundColor: colors.primary },
  actions: { gap: 4 },
});
