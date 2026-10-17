import { View } from 'react-native';
import { colors } from '@/theme/tokens';
import { Icon, Label } from './ui';

export function ChaseBrand() {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible accessibilityLabel="Chase">
    <Icon name="scan-outline" size={25} color={colors.primary} />
    <Label style={{ fontSize: 25, lineHeight: 32, fontWeight: '800', letterSpacing: -1 }}>chase</Label>
  </View>;
}
