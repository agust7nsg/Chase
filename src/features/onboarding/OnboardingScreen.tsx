import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Icon, Label, Panel, Screen, uiStyles } from '@/components/ui';
import { CardArtwork } from '@/components/CardArtwork';
import { colors } from '@/theme/tokens';
import { catalog } from '@/data/mocks/catalog';
import { useChase } from '@/features/app/ChaseProvider';
const steps = [
  { kicker: 'A HOME FOR YOUR CARDS', title: 'Welcome to Chase', description: 'For the cards you love. Discover your favorites and build a collection that feels like yours.' },
  { kicker: 'LESS GUESSWORK. MORE DISCOVERY.', title: 'Scan Your Cards', description: 'A dedicated scanner will help you identify a card and explore its estimated value. Try a clearly labeled sample today.' },
  { kicker: 'YOUR COLLECTION, TOGETHER', title: 'Build Your Collection', description: 'Keep every favorite in one place. Track copies, explore your cards, and see an estimated collection value.' },
];
export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const { state } = useChase();
  if (step === 3) return <Screen>
    <Badge>ONE COMPLIMENTARY IDENTIFICATION</Badge><Label kind="title">Meet your first{`\n`}Chase card.</Label>
    <Label style={uiStyles.muted}>Try one successful sample recognition, on us. You can skip it and use it later from Home.</Label>
    <View style={{ width: '80%', maxWidth: 280, alignSelf: 'center' }}><CardArtwork card={catalog[0]} /></View>
    <Panel><View style={uiStyles.row}><Icon name="information-circle-outline" color={colors.primary} /><Label style={{ flex: 1 }}>This is a demonstration</Label></View><Label kind="caption" style={uiStyles.muted}>Recognition and prices are simulated. We will not access your camera. Your free scan is used only after a successful identification.</Label></Panel>
    <Button title={state.trial.successfulRecognitions === 0 ? 'Try Free Scan' : 'Continue'} onPress={() => router.push({ pathname: state.trial.successfulRecognitions === 0 ? '/scanner' : '/paywall', params: { onboarding: '1' } })} icon="scan-outline" />
    <Button title="Skip for now" variant="ghost" onPress={() => router.push({ pathname: '/paywall', params: { onboarding: '1' } })} />
  </Screen>;
  const content = steps[step];
  return <Screen>
    <View style={uiStyles.between}><View style={uiStyles.row}><Icon name="layers-outline" color={colors.primary} /><Label kind="heading">Chase</Label></View><Pressable style={styles.skip} onPress={() => setStep(3)} accessibilityRole="button"><Label style={uiStyles.muted}>Skip introduction</Label></Pressable></View>
    <View style={styles.visual}>
      {step === 0 ? <View style={{ width: '72%', maxWidth: 255, transform: [{ rotate: '-5deg' }] }}><CardArtwork card={catalog[0]} /></View> : step === 1 ? <View style={styles.scanFrame}><Icon name="scan-outline" size={80} color={colors.primary} /><Label kind="caption" style={{ color: colors.primary }}>A new way to discover</Label></View> : <View style={{ width: '90%', gap: 12 }}><Panel style={{ backgroundColor: colors.white }}><Label kind="caption" style={uiStyles.muted}>YOUR CARD WALLET</Label><View style={uiStyles.between}><Icon name="albums-outline" size={36} color={colors.primary} /><Label kind="heading">Made for collectors</Label></View></Panel><View style={{ flexDirection: 'row', gap: 12 }}>{[catalog[1], catalog[4]].map(card => <View key={card.id} style={{ flex: 1 }}><CardArtwork card={card} compact /></View>)}</View></View>}
    </View>
    <View style={{ gap: 12 }}><Label kind="eyebrow" style={{ color: colors.primary }}>{content.kicker}</Label><Label kind="title">{content.title}</Label><Label style={uiStyles.muted}>{content.description}</Label></View>
    <View style={styles.dots}>{steps.map((_, i) => <View key={i} accessibilityLabel={`Introduction ${i + 1}${i === step ? ', current' : ''}`} style={[styles.dot, { width: i === step ? 24 : 8, backgroundColor: i === step ? colors.primary : colors.border }]} />)}</View>
    <Button title={step === 2 ? 'Get started' : 'Continue'} onPress={() => setStep(step + 1)} icon="arrow-forward" />
    {step > 0 ? <Button title="Back" onPress={() => setStep(step - 1)} variant="ghost" /> : <Label kind="caption" style={{ textAlign: 'center', color: colors.muted }}>No account required. Start collecting as a guest.</Label>}
  </Screen>;
}
const styles = StyleSheet.create({
  visual: { minHeight: 290, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 16 },
  skip: { minHeight: 48, justifyContent: 'center' }, scanFrame: { width: '90%', aspectRatio: 0.95, maxWidth: 270, borderWidth: 2, borderColor: colors.primary, borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 20 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' }, dot: { height: 8, borderRadius: 4 },
});
