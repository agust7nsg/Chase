import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Label } from './ui';

export function ChaseBrand() {
  return <View style={styles.brand} accessible accessibilityLabel="Chase">
    <Image source={require('@/assets/brand/icon.png')} style={styles.icon} contentFit="contain" accessible={false} />
    <Label style={styles.name}>chase</Label>
  </View>;
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 28, height: 28, borderRadius: 8 },
  name: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.8 },
});
