import { router } from 'expo-router';
import { StyleSheet, Switch, View } from 'react-native';
import { Badge, Button, Icon, Label, Panel, Screen, Section, SettingRow, uiStyles } from '@/components/ui';
import { useChase } from '@/features/app/ChaseProvider';
import { colors } from '@/theme/tokens';
import { CollectorMasthead } from '@/components/CollectorMasthead';

export function ProfileScreen() {
  const { state, entitlements, summary, setDevPro } = useChase();
  const openAccount = (section: string) => router.push({ pathname: '/account', params: { section } });

  return <Screen>
    <CollectorMasthead title="Profile" eyebrow="A COLLECTOR AT HEART" caption="Every collection tells a story. This one’s yours." cardId="swshp-053" />

    <Panel style={{ borderRadius: 0, borderWidth: 0, backgroundColor: 'transparent', padding: 0 }}>
      <View style={uiStyles.row}>
        <View style={styles.avatar}><Icon name="person-outline" size={28} color={colors.primary} /></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Label kind="heading">Collecting as a guest</Label>
          <Label kind="caption" style={uiStyles.muted}>Your collection stays on this device.</Label>
        </View>
      </View>
      <Label style={uiStyles.muted}>Accounts aren’t connected yet. Keep collecting as a guest.</Label>
      <Button title="Create Account" onPress={() => openAccount('create')} />
      <Button title="Sign In" variant="secondary" onPress={() => openAccount('signin')} />
    </Panel>

    <View style={{ gap: 8 }}>
      <Section title="Membership" />
      <Panel style={{ borderTopWidth: 3, borderTopColor: colors.primary }}>
        <View style={uiStyles.between}>
          <Label kind="heading">{state.plan === 'pro' ? 'Chase Pro' : 'Chase Free'}</Label>
          <Badge>{state.plan === 'pro' ? 'Simulated' : 'Free'}</Badge>
        </View>
        <Label style={uiStyles.muted}>{entitlements.maxCards === null ? `${summary.totalCopies} saved copies · unlimited prototype capacity` : `${summary.totalCopies} of ${entitlements.maxCards} total card copies saved`}</Label>
        <Label kind="caption" style={uiStyles.muted}>{entitlements.unlimitedScans ? 'Unlimited simulated scans. No purchase has been made.' : state.trial.successfulRecognitions === 0 ? 'Your complimentary successful sample scan is available.' : 'Your complimentary successful sample scan has been used.'}</Label>
        <Button title="Explore Chase Pro" variant="secondary" icon="sparkles-outline" onPress={() => router.push('/paywall')} />
      </Panel>
      <SettingRow title="Restore Purchases" subtitle="Not connected in this prototype" icon="refresh-outline" onPress={() => openAccount('restore')} />
    </View>

    <View>
      <Section title="Settings & support" />
      <SettingRow title="Currency" subtitle="USD · v0.1" icon="cash-outline" onPress={() => openAccount('currency')} />
      <SettingRow title="Privacy Policy" icon="shield-checkmark-outline" onPress={() => openAccount('privacy')} />
      <SettingRow title="Terms of Service" icon="document-text-outline" onPress={() => openAccount('terms')} />
      <SettingRow title="Contact Support" icon="help-circle-outline" onPress={() => openAccount('support')} />
      <SettingRow title="About Chase" icon="information-circle-outline" onPress={() => openAccount('about')} />
    </View>

    {__DEV__ ? <Panel>
      <Badge>Development only</Badge>
      <View style={uiStyles.between}>
        <View style={{ flex: 1, gap: 6 }}>
          <Label style={{ fontWeight: '600' }}>Development only · simulate Pro</Label>
          <Label kind="caption" style={uiStyles.muted}>Local demo access. No purchase.</Label>
        </View>
        <Switch value={state.plan === 'pro'} onValueChange={setDevPro} accessibilityLabel="Development only · simulate Pro" trackColor={{ false: colors.border, true: colors.primary }} />
      </View>
      <Button title="Preview onboarding" variant="ghost" icon="images-outline" onPress={() => router.push('/onboarding')} />
    </Panel> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  avatar: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
