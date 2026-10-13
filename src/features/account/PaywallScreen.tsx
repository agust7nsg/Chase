import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { BackHandler, Pressable, View } from 'react-native';
import { Badge, Button, Icon, Label, Panel, Screen, uiStyles } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';
const benefits = [
  { title: 'Keep discovering', detail: 'Unlimited scanning, subject to future fair-use controls.', icon: 'scan-outline' as const },
  { title: 'Room for every favorite', detail: 'Unlimited saved copies and collections.', icon: 'albums-outline' as const },
  { title: 'More ways to collect', detail: 'Graded prices and CSV export are planned for a future release.', icon: 'sparkles-outline' as const },
];
export default function PaywallScreen() {
  const { completeOnboarding } = useChase();
  const close = useCallback(() => { completeOnboarding(); router.replace('/(tabs)'); }, [completeOnboarding]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => subscription.remove();
  }, [close]));
  return <Screen>
    <View style={uiStyles.between}><Badge>CHASE PRO</Badge><Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close Chase Pro and go to Home" style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={28} /></Pressable></View>
    <View style={{ gap: 16, paddingVertical: 16 }}><View style={{ width: 72, height: 72, borderRadius: 16, backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center' }}><Icon name="layers-outline" size={38} color={colors.primary} /></View><Label kind="title">More cards.{`\n`}More possibilities.</Label><Label style={uiStyles.muted}>For the collection you’re still building.</Label></View>
    <View style={{ gap: 28 }}>{benefits.map(item => <View key={item.title} style={[uiStyles.row, { alignItems: 'flex-start' }]}><View style={{ paddingTop: 4 }}><Icon name={item.icon} color={colors.primary} /></View><View style={{ flex: 1, gap: 5 }}><Label kind="heading">{item.title}</Label><Label style={uiStyles.muted}>{item.detail}</Label></View></View>)}</View>
    <Panel><Label style={{ fontWeight: '600' }}>Free is a great place to start</Label><Label kind="caption" style={uiStyles.muted}>Search cards manually, maintain one collection with up to 50 total copies, and try one complimentary successful scan.</Label></Panel>
    <Panel style={{ backgroundColor: colors.primarySoft, borderColor: '#DBEAFE' }}><Label style={{ color: colors.primary, fontWeight: '600' }}>Purchases are not connected</Label><Label kind="caption" style={uiStyles.muted}>This paywall is a frontend preview. Pricing and subscriptions are not available yet. No payment will be taken.</Label></Panel>
    <Button title="Continue with Free" onPress={close} />
    {__DEV__ ? <Label kind="caption" style={{ color: colors.muted, textAlign: 'center' }}>Developers can simulate Pro from Profile.</Label> : null}
  </Screen>;
}
