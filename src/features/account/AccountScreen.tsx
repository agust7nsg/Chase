import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';
import { Badge, Button, Icon, Label, Panel, Screen, uiStyles, type IconName } from '@/components/ui';
import { legalLinks } from '@/config/links';
import { colors } from '@/theme/tokens';

type SectionName = 'create' | 'signin' | 'restore' | 'privacy' | 'terms' | 'support' | 'currency' | 'about' | 'delete' | 'logout';
type Workflow = { title: string; icon: IconName; message: string; detail: string };

const workflows: Record<SectionName, Workflow> = {
  create: {
    title: 'Create Account', icon: 'person-add-outline',
    message: 'Account creation is not connected yet.',
    detail: 'Chase v0.1 works as a guest prototype. Your saved cards stay on this device; cloud backup and cross-device access will need a real authentication service.',
  },
  signin: {
    title: 'Sign In', icon: 'log-in-outline',
    message: 'Sign in is not connected yet.',
    detail: 'No credentials are collected in this prototype. You can continue browsing, searching, and managing your local collection as a guest.',
  },
  restore: {
    title: 'Restore Purchases', icon: 'refresh-outline',
    message: 'Purchase restoration is not connected yet.',
    detail: 'This prototype does not process or restore purchases. A future store integration will verify an existing subscription before granting paid access.',
  },
  privacy: {
    title: 'Privacy Policy', icon: 'shield-checkmark-outline',
    message: 'A published Privacy Policy is not available yet.',
    detail: 'A reviewed policy and its real HTTPS link must be configured before release. No legal document is fabricated for this prototype.',
  },
  terms: {
    title: 'Terms of Service', icon: 'document-text-outline',
    message: 'Published Terms of Service are not available yet.',
    detail: 'Reviewed terms and their real HTTPS link must be configured before release. This prototype does not provide a substitute legal agreement.',
  },
  support: {
    title: 'Contact Support', icon: 'help-circle-outline',
    message: 'A support destination is not configured yet.',
    detail: 'The team must add a real HTTPS support page before release. This prototype does not send support requests.',
  },
  currency: {
    title: 'Currency', icon: 'cash-outline',
    message: 'US Dollar (USD)',
    detail: 'Chase v0.1 displays all sample market estimates in USD. Currency conversion is not available. Estimates are illustrative and are not guaranteed resale prices.',
  },
  about: {
    title: 'About Chase', icon: 'information-circle-outline',
    message: 'Chase · v0.1 frontend prototype',
    detail: 'A simple place to discover sample Pokémon cards and build a local collection. Recognition, prices, and membership access are simulated; artwork is illustrative rather than a real TCG card scan.',
  },
  delete: {
    title: 'Delete Account', icon: 'trash-outline',
    message: 'Account deletion will be available after real authentication is connected.',
    detail: 'You are using Chase as a guest and there is no account to delete. A future deletion flow must explain its consequences and require explicit confirmation before contacting the account service. No data is deleted here.',
  },
  logout: {
    title: 'Log Out', icon: 'log-out-outline',
    message: 'Log out will be available after real authentication is connected.',
    detail: 'You are currently a guest. There is no signed-in session to end, and your local collection remains on this device.',
  },
};

function isSection(value: string | undefined): value is SectionName {
  return value !== undefined && Object.prototype.hasOwnProperty.call(workflows, value);
}

export function AccountScreen() {
  const { section } = useLocalSearchParams<{ section?: string | string[] }>();
  const requestedSection = Array.isArray(section) ? section[0] : section;
  const activeSection = isSection(requestedSection) ? requestedSection : 'about';
  const workflow = workflows[activeSection];
  const isExternalSection = activeSection === 'privacy' || activeSection === 'terms' || activeSection === 'support';
  const configuredUrl = isExternalSection ? legalLinks[activeSection] : null;
  const isHttpsUrl = configuredUrl !== null && /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(configuredUrl);
  const [linkError, setLinkError] = useState<string | null>(null);

  const openConfiguredLink = async () => {
    if (!configuredUrl || !isHttpsUrl) return;
    setLinkError(null);
    try { await Linking.openURL(configuredUrl); }
    catch { setLinkError('This link could not be opened. Try again or check your connection.'); }
  };

  return <Screen safeTop={false}>
    <View style={{ gap: 12 }}>
      <Icon name={workflow.icon} size={32} color={colors.primary} />
      <Label kind="title" accessibilityRole="header">{workflow.title}</Label>
    </View>
    <Panel>
      <Badge>{isExternalSection && isHttpsUrl ? 'Configured destination' : activeSection === 'currency' ? 'USD in v0.1' : 'Prototype information'}</Badge>
      <Label kind="heading">{isExternalSection && isHttpsUrl ? `View ${workflow.title.toLowerCase()}` : workflow.message}</Label>
      <Label style={uiStyles.muted}>{isExternalSection && isHttpsUrl ? 'Open the configured page in your browser.' : workflow.detail}</Label>
      {isExternalSection && isHttpsUrl ? <Button title="Open website" icon="open-outline" onPress={() => { void openConfiguredLink(); }} /> : null}
      {isExternalSection && configuredUrl !== null && !isHttpsUrl ? <Label style={{ color: colors.danger }}>The configured link must be a valid HTTPS URL.</Label> : null}
      {linkError ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{linkError}</Label> : null}
    </Panel>
    {activeSection === 'about' ? <Panel>
      <Label kind="heading">Artwork & attribution</Label>
      <Label style={uiStyles.muted}>Sample Pokémon artwork is provided by the PokeAPI sprites project. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc.</Label>
      <Label kind="caption" style={uiStyles.muted}>Chase is an independent prototype and is not affiliated with or endorsed by those companies. Sample artwork, printing details, and prices do not constitute live card data.</Label>
    </Panel> : null}
    <Label kind="caption" style={uiStyles.muted}>You can return to Profile using the back button.</Label>
  </Screen>;
}
