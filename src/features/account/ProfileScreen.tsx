import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { Badge, Button, Icon, Label, Panel, Screen, Section, SettingRow, uiStyles } from '@/components/ui';
import { useChase } from '@/features/app/ChaseProvider';
import { colors } from '@/theme/tokens';

export function ProfileScreen() {
  const { state, entitlements, summary, setDevPro } = useChase();
  const { fontScale } = useWindowDimensions();
  const openAccount = (section: string) => router.push({ pathname: '/account', params: { section } });
  const capacity = entitlements.maxCards === null ? null : Math.min(summary.totalCopies / entitlements.maxCards, 1);

  return <Screen>
    <View style={[styles.identity, fontScale > 1.3 && styles.identityLarge]}>
      <View pointerEvents="none" style={styles.mewOrbit} accessible={false} />
      <View style={[styles.identityCopy, fontScale > 1.3 && { width: '100%' }]}>
        <Label kind="title" accessibilityRole="header">Profile</Label>
        <View style={{ gap: 8 }}><Label style={styles.guestName}>Guest collector</Label><Badge tone="blue">{state.plan === 'pro' ? 'Pro · demo' : 'Chase Free'}</Badge></View>
      </View>
      <Image source={require('../../../assets/cards/mew.png')} contentFit="contain" style={styles.mew} accessibilityLabel="Mew, Pokémon illustration" />
    </View>

    <View style={{ gap: 12 }}>
      <Section title="Membership" />
      <View style={{ gap: 9 }}>
        <View style={uiStyles.between}><Label kind="caption" style={uiStyles.muted}>Cards</Label><Label kind="caption" style={{ fontWeight: '600' }}>{entitlements.maxCards === null ? `${summary.totalCopies} copies · unlimited` : `${summary.totalCopies} / ${entitlements.maxCards} copies`}</Label></View>
        {capacity !== null ? <View style={styles.capacityTrack} accessible accessibilityLabel={`${summary.totalCopies} of ${entitlements.maxCards} saved copies`}><View style={[styles.capacityFill, { width: `${capacity * 100}%` }]} /></View> : null}
      </View>
      <View style={[uiStyles.row, { alignItems: 'flex-start' }]}><Icon name="scan-outline" color={colors.muted} size={19} /><Label kind="caption" style={[uiStyles.muted, { flex: 1 }]}>{entitlements.unlimitedScans ? 'Unlimited demo scans' : state.trial.successfulRecognitions === 0 ? '1 free demo scan' : 'Free scan used'}</Label></View>
      <Button title="Explore Chase Pro" variant="secondary" onPress={() => router.push('/paywall')} />
      <SettingRow title="Restore Purchases" icon="refresh-outline" onPress={() => openAccount('restore')} />
    </View>

    <View style={{ gap: 8 }}>
      <Section title="Account" />
      <Label kind="caption" style={uiStyles.muted}>Accounts not connected</Label>
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
      <View style={uiStyles.between}>
        <View style={{ flex: 1, gap: 6 }}><Label style={{ fontWeight: '600' }}>Development only · simulate Pro</Label><Label kind="caption" style={uiStyles.muted}>No payment</Label></View>
        <Switch value={state.plan === 'pro'} onValueChange={setDevPro} accessibilityLabel="Development only · simulate Pro" trackColor={{ false: colors.border, true: colors.primary }} />
      </View>
      <Button title="Preview onboarding" variant="ghost" icon="images-outline" onPress={() => router.push('/onboarding')} />
    </Panel> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  identity: { marginTop: -24, marginHorizontal: -24, paddingHorizontal: 24, paddingVertical: 28, minHeight: 216, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.mewSoft, overflow: 'hidden' },
  identityLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  identityCopy: { width: '48%', gap: 24, zIndex: 1 },
  guestName: { fontWeight: '600', color: colors.mewAccent },
  mew: { width: '52%', aspectRatio: 1, maxWidth: 196, alignSelf: 'center', transform: [{ rotate: '-9deg' }] },
  mewOrbit: { position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 1, borderColor: colors.white, right: -16, top: 0 },
  capacityTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  capacityFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  accountActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 8 },
  developer: { backgroundColor: colors.subtle, borderWidth: 0, borderRadius: 14 },
});
