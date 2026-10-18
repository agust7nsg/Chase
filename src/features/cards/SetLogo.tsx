import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon } from '@/components/ui';
import { colors } from '@/theme/tokens';
import type { CatalogSet } from '@/services/tcgdex/types';

function logoSource(source?: string): string | undefined {
  if (!source) return undefined;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:') return undefined;
    if (!/\.(?:webp|png|jpe?g|svg)$/i.test(url.pathname)) url.pathname += '.webp';
    return url.href;
  } catch { return undefined; }
}

/** Set branding never falls back to a card illustration. */
export function SetLogo({ set, width = 88, height = 52 }: { set: CatalogSet; width?: number; height?: number }) {
  const [failed, setFailed] = useState<string[]>([]);
  const logo = logoSource(set.logo);
  const symbol = logoSource(set.symbol);
  const source = [logo, symbol].find((url): url is string => Boolean(url && !failed.includes(url)));
  if (!source) return <View accessible accessibilityRole="image" accessibilityLabel={`${set.name} logo unavailable`}
    style={{ width, height, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.subtle, borderRadius: 8 }}>
    <Icon name="layers-outline" color={colors.muted} size={26} />
  </View>;
  return <Image source={{ uri: source }} contentFit="contain" cachePolicy="memory-disk" recyclingKey={`${set.id}:${source}`}
    accessibilityLabel={`${set.name} set ${source === logo ? 'logo' : 'symbol'}`} onError={() => setFailed(previous => [...previous, source])}
    style={{ width, height }} />;
}
