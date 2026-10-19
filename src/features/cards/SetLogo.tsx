import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon, Label } from '@/components/ui';
import { colors } from '@/theme/tokens';
import type { CatalogSet } from '@/services/tcgdex/types';
import { setLogoSources, usesAnniversaryBranding } from '@/services/tcgdex/artwork';

const anniversaryLogo = require('../../../assets/sets/30th-celebration.png');

/** Set branding never falls back to a card illustration. */
export function SetLogo({ set, width = 88, height = 52 }: { set: CatalogSet; width?: number; height?: number }) {
  const [failed, setFailed] = useState<string[]>([]);
  const source = setLogoSources(set).find(url => !failed.includes(url));
  if (!source && usesAnniversaryBranding(set.id)) return <View accessible accessibilityRole="image" accessibilityLabel={`${set.name} anniversary logo`}
    style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
    <Image source={anniversaryLogo} contentFit="contain" style={{ width, flex: 1, alignSelf: 'stretch' }} />
    {set.id === '30th-c' ? <Label style={{ color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' }}>CLASSIC</Label> : null}
  </View>;
  if (!source) return <View accessible accessibilityRole="image" accessibilityLabel={`${set.name} logo unavailable`}
    style={{ width, height, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.subtle, borderRadius: 8 }}>
    <Icon name="layers-outline" color={colors.muted} size={26} />
  </View>;
  return <Image source={{ uri: source }} contentFit="contain" cachePolicy="memory-disk" recyclingKey={`${set.id}:${source}`}
    accessibilityLabel={`${set.name} set ${set.logo && source.startsWith(set.logo.replace(/\/$/, '')) ? 'logo' : 'symbol'}`} onError={() => setFailed(previous => previous.includes(source) ? previous : [...previous, source])}
    style={{ width, height }} />;
}
