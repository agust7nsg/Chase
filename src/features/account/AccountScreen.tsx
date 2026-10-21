import { useCurrency } from '@/features/currency/CurrencyProvider';
import { CURRENCY_NAMES } from '@/services/currency';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';
import { Badge, Button, Icon, Label, Screen, uiStyles, type IconName } from '@/components/ui';
import { legalLinks } from '@/config/links';
import { colors } from '@/theme/tokens';
import { AccountAuthScreen, type AuthMode } from './AccountAuthScreen';
import { useAuth } from './AuthProvider';

type SectionName = 'restore' | 'privacy' | 'terms' | 'support' | 'currency' | 'about' | 'delete';
type Workflow = { title: string; icon: IconName; message: string; detail: string };

const workflows: Record<SectionName, Workflow> = {
  restore: {
    title: 'Restore Purchases', icon: 'refresh-outline',
    message: 'Purchase restoration is not connected yet.',
    detail: 'Chase does not process payments or restore subscriptions in this prototype. Your current access remains unchanged.',
  },
  privacy: {
    title: 'Privacy Policy', icon: 'shield-checkmark-outline',
    message: 'A published Privacy Policy is not available yet.',
    detail: 'The reviewed policy will be linked here before release. Collection data in this prototype is stored on your device.',
  },
  terms: {
    title: 'Terms of Service', icon: 'document-text-outline',
    message: 'Published Terms of Service are not available yet.',
    detail: 'The reviewed terms will be linked here before release.',
  },
  support: {
    title: 'Contact Support', icon: 'help-circle-outline',
    message: 'A support destination is not configured yet.',
    detail: 'A support page will be linked here when available. This screen does not send a support request.',
  },
  currency: {
    title: 'Currency', icon: 'cash-outline',
    message: 'Display currency',
    detail: 'Choose USD or EUR for card prices and collection values.',
  },
  about: {
    title: 'About Chase', icon: 'information-circle-outline',
    message: 'Chase · v0.1 frontend prototype',
    detail: 'Identify Pokémon TCG printings and manage a collection on your device. Card images show real printings; recognition, prices, and membership access are simulated.',
  },
  delete: {
    title: 'Delete Account', icon: 'trash-outline',
    message: 'Account deletion is not connected yet.',
    detail: 'You are using Chase as a guest and there is no account to delete. No collection data is deleted here. Account deletion will require confirmation when accounts become available.',
  },
};

function isSection(value: string | undefined): value is SectionName {
  return value !== undefined && Object.prototype.hasOwnProperty.call(workflows, value);
}

export function AccountScreen() {
  const auth = useAuth();
  const { currency, openCurrencySelector } = useCurrency();
  const { section } = useLocalSearchParams<{ section?: string | string[] }>();
  const requestedSection = Array.isArray(section) ? section[0] : section;
  const activeSection = isSection(requestedSection) ? requestedSection : 'about';
  const workflow = activeSection === 'currency' ? { ...workflows.currency, message: `${CURRENCY_NAMES[currency]} (${currency})` }
    : activeSection === 'delete' && auth.user ? { ...workflows.delete, message: 'Account deletion is not connected yet.', detail: 'Your account has not been deleted. An authenticated deletion service must be connected before this action becomes available.' }
    : workflows[activeSection];
  const isExternalSection = activeSection === 'privacy' || activeSection === 'terms' || activeSection === 'support';
  const configuredUrl = isExternalSection ? legalLinks[activeSection] : null;
  const isHttpsUrl = configuredUrl !== null && /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(configuredUrl);
  const [linkError, setLinkError] = useState<string | null>(null);

  if (['create', 'signin', 'logout', 'forgot', 'reset'].includes(requestedSection ?? '')) return <AccountAuthScreen key={requestedSection} mode={requestedSection as AuthMode} />;

  const openConfiguredLink = async () => {
    if (!configuredUrl || !isHttpsUrl) return;
    setLinkError(null);
    try { await Linking.openURL(configuredUrl); }
    catch { setLinkError('This link could not be opened. Try again or check your connection.'); }
  };

  return <Screen safeTop={false}>
    <View style={styles.header}>
      <View style={styles.icon}><Icon name={workflow.icon} size={27} color={colors.primary} /></View>
      <Label kind="title" accessibilityRole="header">{workflow.title}</Label>
    </View>
    <View style={styles.information}>
      <Badge tone="neutral">{isExternalSection && isHttpsUrl ? 'External page' : activeSection === 'currency' ? 'Display currency' : activeSection === 'about' ? 'Version 0.1' : 'Prototype information'}</Badge>
      <Label kind="heading">{isExternalSection && isHttpsUrl ? `View ${workflow.title.toLowerCase()}` : workflow.message}</Label>
      <Label style={uiStyles.muted}>{isExternalSection && isHttpsUrl ? 'Open the configured page in your browser.' : workflow.detail}</Label>
      {activeSection === 'currency' ? <Button title="Change currency" onPress={openCurrencySelector} /> : null}
      {isExternalSection && isHttpsUrl ? <Button title="Open website" icon="open-outline" onPress={() => { void openConfiguredLink(); }} /> : null}
      {isExternalSection && configuredUrl !== null && !isHttpsUrl ? <Label style={{ color: colors.danger }}>The configured link must be a valid HTTPS URL.</Label> : null}
      {linkError ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{linkError}</Label> : null}
    </View>
    {activeSection === 'about' ? <View style={styles.attribution}>
      <Label style={{ fontWeight: '600' }}>Artwork & attribution</Label>
      <Label kind="caption" style={uiStyles.muted}>Pokémon TCG card images supplied by TCGdex. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc.</Label>
      <Label kind="caption" style={uiStyles.muted}>Chase is an independent prototype and is not affiliated with or endorsed by those companies. Bundled images are printing references; prices are not live market quotes.</Label>
    </View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { paddingTop: 16, gap: 24 },
  icon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  information: { gap: 16, paddingTop: 24, paddingBottom: 24, borderTopWidth: 1, borderColor: colors.border },
  attribution: { gap: 12, paddingTop: 24, borderTopWidth: 1, borderColor: colors.border },
});
