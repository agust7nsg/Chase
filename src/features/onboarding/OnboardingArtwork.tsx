import { View } from 'react-native';
import { CollectorScene } from '@/components/CollectorScene';
import { Icon, Label, uiStyles } from '@/components/ui';
import { colors } from '@/theme/tokens';

const presentations = [
  { ids: ['base1-4', 'swsh7-215', 'xyp-XY133'], mood: 'ember', kicker: 'FROM FIRST PACK TO FOREVER FAVORITE', name: 'Charizard · Base Set', detail: 'Illustrative price · USD', price: '$245.00', icon: 'sparkles-outline' },
  { ids: ['swsh12-186'], mood: 'sky', kicker: 'EVERY PRINT HAS A STORY', name: 'Lugia V', detail: 'Silver Tempest · 186/195', price: 'Demo', icon: 'scan-outline' },
  { ids: ['swsh11-186', 'swsh8-271', 'sv2-203'], mood: 'cosmic', kicker: 'BIG CHASES. LITTLE FAVORITES.', name: 'A collection that feels like you.', detail: 'Save cards. Track copies. Keep the memories.', price: '', icon: 'albums-outline' },
  { ids: ['swsh7-192'], mood: 'sky', kicker: 'YOUR NEXT DISCOVERY', name: 'One card. A closer look.', detail: 'A preview of the sample scan experience.', price: 'Demo', icon: 'scan-outline' },
] as const;

export function OnboardingArtwork({ step }: { step: 0 | 1 | 2 | 3 }) {
  const item = presentations[step];
  return <View style={{ gap: 16 }}>
    <CollectorScene ids={item.ids} mood={item.mood} height={260} framed={step === 1 || step === 3} style={{ marginHorizontal: -24 }} />
    <View style={{ gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 18 }}>
      <View style={[uiStyles.row, { gap: 6 }]}><Icon name={item.icon} size={16} color={colors.primary} /><Label kind="eyebrow" style={{ color: colors.primary }}>{item.kicker}</Label></View>
      <View style={uiStyles.between}><View style={{ flex: 1, gap: 3 }}><Label style={{ fontWeight: '700' }}>{item.name}</Label><Label kind="caption" style={uiStyles.muted}>{item.detail}</Label></View>{item.price ? <Label kind="heading" style={{ color: colors.primary }}>{item.price}</Label> : null}</View>
    </View>
  </View>;
}
