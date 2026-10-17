import { router } from 'expo-router';
import { StyleSheet, Switch, View } from 'react-native';
import { Badge, Button, Icon, Label, Panel, Screen, Section, SettingRow, uiStyles } from '@/components/ui';
import { useChase } from '@/features/app/ChaseProvider';
import { colors } from '@/theme/tokens';

export function ProfileScreen() {
  const { state, entitlements, summary, setDevPro } = useChase();
  const openAccount = (section: string) => router.push({ pathname: '/account', params: { section } });
  const capacity = entitlements.maxCards === null ? null : Math.min(summary.totalCopies / entitlements.maxCards, 1);

  return <Screen>
    <Label kind="title" accessibilityRole="header">Profile</Label>
    <View style={styles.identity}>
      <View style={styles.avatar}><Icon name="person-outline" size={25} color={colors.primary} /></View>
      <View style={{ flex: 1, gap: 3 }}><Label kind="heading">Guest collector</Label><Label kind="caption" style={uiStyles.muted}>Saved on this device</Label></View>
    </View>
    <View style={styles.collectionFacts}>
      <View style={styles.fact}><Label kind="heading">{summary.totalCopies}</Label><Label kind="caption" style={uiStyles.muted}>Saved copies</Label></View>
      <View style={styles.factDivider} />
      <View style={styles.fact}><Label kind="heading">{summary.uniqueCards}</Label><Label kind="caption" style={uiStyles.muted}>Printings</Label></View>
      <View style={styles.factDivider} />
      <View style={styles.fact}><Label kind="heading">USD</Label><Label kind="caption" style={uiStyles.muted}>Currency</Label></View>
    </View>

    <View style={{ gap: 12 }}>
      <Section title="Membership" />
      <View style={uiStyles.between}><Label style={{ fontWeight: '600' }}>{state.plan === 'pro' ? 'Chase Pro' : 'Chase Free'}</Label><Badge tone={state.plan === 'pro' ? 'warm' : 'neutral'}>{state.plan === 'pro' ? 'Simulated' : 'Current plan'}</Badge></View>
      <View style={{ gap: 9 }}>
        <View style={uiStyles.between}><Label kind="caption" style={uiStyles.muted}>Collection capacity</Label><Label kind="caption" style={{ fontWeight: '600' }}>{entitlements.maxCards === null ? `${summary.totalCopies} copies · unlimited` : `${summary.totalCopies} / ${entitlements.maxCards} copies`}</Label></View>
        {capacity !== null ? <View style={styles.capacityTrack} accessible accessibilityLabel={`${summary.totalCopies} of ${entitlements.maxCards} saved copies`}><View style={[styles.capacityFill, { width: `${capacity * 100}%` }]} /></View> : null}
      </View>
      <View style={[uiStyles.row, { alignItems: 'flex-start' }]}><Icon name="scan-outline" color={colors.muted} size={19} /><Label kind="caption" style={[uiStyles.muted, { flex: 1 }]}>{entitlements.unlimitedScans ? 'Unlimited sample scans · no purchase made' : state.trial.successfulRecognitions === 0 ? '1 complimentary successful sample scan available' : 'Complimentary sample scan used'}</Label></View>
      <Button title="Explore Chase Pro" variant="secondary" onPress={() => router.push('/paywall')} />
      <SettingRow title="Restore Purchases" subtitle="Purchase restoration is not connected" icon="refresh-outline" onPress={() => openAccount('restore')} />
    </View>

    <View style={{ gap: 8 }}>
      <Section title="Account" />
      <Label kind="caption" style={uiStyles.muted}>Accounts are not connected yet. Continue as a guest.</Label>
      <View style={styles.accountActions}><View style={{ flex: 1, minWidth: 115 }}><Button title="Create Account" variant="ghost" onPress={() => openAccount('create')} /></View><View style={{ flex: 1, minWidth: 95 }}><Button title="Sign In" variant="ghost" onPress={() => openAccount('signin')} /></View></View>
    </View>

    <View>
      <Section title="Settings & support" />
      <SettingRow title="Currency" subtitle="US Dollar · USD" icon="cash-outline" onPress={() => openAccount('currency')} />
      <SettingRow title="Privacy Policy" icon="shield-checkmark-outline" onPress={() => openAccount('privacy')} />
      <SettingRow title="Terms of Service" icon="document-text-outline" onPress={() => openAccount('terms')} />
      <SettingRow title="Contact Support" icon="help-circle-outline" onPress={() => openAccount('support')} />
      <SettingRow title="About Chase" subtitle="Version 0.1" icon="information-circle-outline" onPress={() => openAccount('about')} />
    </View>

    {__DEV__ ? <Panel style={styles.developer}>
      <Badge tone="neutral">Development only</Badge>
      <View style={uiStyles.between}>
        <View style={{ flex: 1, gap: 6 }}><Label style={{ fontWeight: '600' }}>Development only · simulate Pro</Label><Label kind="caption" style={uiStyles.muted}>Local access simulation. No payment.</Label></View>
        <Switch value={state.plan === 'pro'} onValueChange={setDevPro} accessibilityLabel="Development only · simulate Pro" trackColor={{ false: colors.border, true: colors.primary }} />
      </View>
      <Button title="Preview onboarding" variant="ghost" icon="images-outline" onPress={() => router.push('/onboarding')} />
    </Panel> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  collectionFacts: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  fact: { flex: 1, gap: 5, alignItems: 'center' },
  factDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginVertical: 2 },
  capacityTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  capacityFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  accountActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 8 },
  developer: { backgroundColor: colors.subtle, borderWidth: 0, borderRadius: 14 },
});
