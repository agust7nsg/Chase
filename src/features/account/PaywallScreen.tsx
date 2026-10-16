import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { BackHandler, Pressable, View } from 'react-native';
import { Badge, Button, Icon, Label, Panel, Screen, uiStyles } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';
import { CollectorScene } from '@/components/CollectorScene';
const benefits = [
  { title: 'Keep discovering', detail: 'Unlimited scanning with future fair-use limits.', icon: 'scan-outline' as const },
  { title: 'Room for every favorite', detail: 'Unlimited saved copies and collections.', icon: 'albums-outline' as const },
  { title: 'More ways to collect', detail: 'Graded prices and CSV export, planned for later.', icon: 'sparkles-outline' as const },
];
export default function PaywallScreen() {
  const { completeOnboarding } = useChase();
  const close = useCallback(() => { completeOnboarding(); router.replace('/(tabs)'); }, [completeOnboarding]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => subscription.remove();
  }, [close]));
  return <Screen>
    <View style={uiStyles.between}><Badge tone="warm">CHASE PRO</Badge><Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close Chase Pro and go to Home" style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={28} /></Pressable></View>
    <CollectorScene ids={['swsh8-271', 'swsh7-215', 'swsh11-186']} mood="cosmic" height={240} style={{ marginHorizontal: -24 }} />
    <View style={{ gap: 12 }}><Label kind="title">More room for{`\n`}what you love.</Label><Label style={uiStyles.muted}>Keep your next great find. And the one after.</Label></View>
    <View style={{ gap: 28 }}>{benefits.map(item => <View key={item.title} style={[uiStyles.row, { alignItems: 'flex-start' }]}><View style={{ paddingTop: 4 }}><Icon name={item.icon} color={colors.primary} /></View><View style={{ flex: 1, gap: 5 }}><Label kind="heading">{item.title}</Label><Label style={uiStyles.muted}>{item.detail}</Label></View></View>)}</View>
    <Panel><Label style={{ fontWeight: '600' }}>Free is a great place to start</Label><Label kind="caption" style={uiStyles.muted}>Free search, 50 saved copies, and one successful sample scan.</Label></Panel>
    <Panel style={{ backgroundColor: colors.primarySoft, borderColor: colors.tintBorder }}><Label style={{ color: colors.primary, fontWeight: '600' }}>Purchases are not connected</Label><Label kind="caption" style={uiStyles.muted}>Preview only. Subscriptions are unavailable; no payment is taken.</Label></Panel>
    <Button title="Continue with Free" onPress={close} />
    {__DEV__ ? <Label kind="caption" style={{ color: colors.muted, textAlign: 'center' }}>Developers can simulate Pro from Profile.</Label> : null}
  </Screen>;
}
