import { useCurrency } from '@/features/currency/CurrencyProvider';
import { CURRENCY_NAMES } from '@/services/currency';
import { router } from 'expo-router';
import { StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { Badge, Button, Label, Panel, Screen, Section, SettingRow, uiStyles } from '@/components/ui';
import { useChase } from '@/features/app/ChaseProvider';
import { colors } from '@/theme/tokens';
import { CardPrint } from '@/components/CardPrint';
import { getCatalogCard } from '@/data/mocks/catalog';
import { useAuth } from './AuthProvider';

const profileCard = getCatalogCard('swsh8-269')!;

export function ProfileScreen() {
  const { currency, openCurrencySelector } = useCurrency();
  const { state, setDevPro } = useChase();
  const auth = useAuth();
  const { fontScale } = useWindowDimensions();
  const openAccount = (section: string) => router.push({ pathname: '/account', params: { section } });

  return <Screen>
    <View style={[styles.identity, fontScale > 1.3 && styles.identityLarge]}>
      <View pointerEvents="none" style={styles.mewOrbit} accessible={false} />
      <View style={[styles.identityCopy, fontScale > 1.3 && { width: '100%' }]}>
        <Label kind="title" accessibilityRole="header">Profile</Label>
        <View style={{ gap: 8 }}><Label style={styles.guestName}>{auth.user?.displayName ?? 'Guest collector'}</Label><Badge tone="blue">{state.plan === 'pro' ? 'Pro · demo' : 'Chase Free'}</Badge></View>
      </View>
      <View style={styles.mew}><CardPrint card={profileCard} /></View>
    </View>

    <View style={{ gap: 8 }}>
      <Section title="Account" />
      <Label kind="caption" style={uiStyles.muted}>{!auth.ready ? 'Checking account…' : auth.user?.email ?? 'Your collection stays on this device'}</Label>
      {auth.error ? <><Label kind="caption" accessibilityRole="alert" style={{ color: colors.danger }}>{auth.error}</Label><Button title="Retry account connection" variant="ghost" onPress={auth.retry} /></> : null}
      {auth.user ? <SettingRow title="Log Out" icon="log-out-outline" onPress={() => openAccount('logout')} />
        : <View style={styles.accountActions}><View style={{ flex: 1, minWidth: 115 }}><Button title="Create Account" variant="ghost" onPress={() => openAccount('create')} /></View><View style={{ flex: 1, minWidth: 95 }}><Button title="Sign In" variant="ghost" onPress={() => openAccount('signin')} /></View></View>}
    </View>

    <View>
      <Section title="Settings & support" />
      <SettingRow title="Currency" subtitle={`${CURRENCY_NAMES[currency]} · ${currency}`} icon="cash-outline" onPress={openCurrencySelector} />
      <SettingRow title="Privacy Policy" icon="shield-checkmark-outline" onPress={() => openAccount('privacy')} />
      <SettingRow title="Terms of Service" icon="document-text-outline" onPress={() => openAccount('terms')} />
      <SettingRow title="Contact Support" icon="help-circle-outline" onPress={() => openAccount('support')} />
      <SettingRow title="About Chase" subtitle="Version 0.1" icon="information-circle-outline" onPress={() => openAccount('about')} />
    </View>

    <View>
      <Section title="Chase Pro" />
      <SettingRow title="Explore Chase Pro" icon="sparkles-outline" onPress={() => router.push('/paywall')} />
      <SettingRow title="Restore Purchases" icon="refresh-outline" onPress={() => openAccount('restore')} />
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
  mew: { width: '43%', maxWidth: 144, alignSelf: 'center', transform: [{ rotate: '8deg' }], shadowColor: colors.text, shadowOpacity: 0.12, shadowOffset: { width: 0, height: 6 }, shadowRadius: 10, elevation: 3 },
  mewOrbit: { position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 1, borderColor: colors.white, right: -16, top: 0 },
  accountActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 8 },
  developer: { backgroundColor: colors.subtle, borderWidth: 0, borderRadius: 14 },
});
