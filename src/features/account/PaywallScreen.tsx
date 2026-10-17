import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Icon, Label, Screen, uiStyles } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useChase } from '@/features/app/ChaseProvider';

const comparison = [
  { feature: 'Sample scans', free: '1 successful scan', pro: 'Unlimited' },
  { feature: 'Saved copies', free: '50 total', pro: 'Unlimited' },
  { feature: 'Manual search', free: 'Included', pro: 'Included' },
  { feature: 'Sample prices', free: 'Included', pro: 'Included' },
];

export default function PaywallScreen() {
  const { completeOnboarding } = useChase();
  const close = useCallback(() => { completeOnboarding(); router.replace('/(tabs)'); }, [completeOnboarding]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => subscription.remove();
  }, [close]));

  return <Screen>
    <View style={uiStyles.between}>
      <Badge tone="neutral">Membership preview</Badge>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close Chase Pro and go to Home" style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}><Icon name="close" size={27} /></Pressable>
    </View>
    <View style={{ gap: 12 }}>
      <View style={styles.proMark}><Icon name="layers-outline" color={colors.primary} size={28} /></View>
      <Label kind="title" accessibilityRole="header">Chase Pro</Label>
      <Label style={uiStyles.muted}>More capacity for your collection and sample scans.</Label>
    </View>

    <View>
      <View style={styles.tableHeader}>
        <View style={styles.featureColumn}><Label kind="caption" style={uiStyles.muted}>COMPARE ACCESS</Label></View>
        <View style={styles.planColumn}><Label style={{ fontWeight: '600' }}>Free</Label></View>
        <View style={[styles.planColumn, styles.proColumn]}><Label style={{ color: colors.primary, fontWeight: '700' }}>Pro</Label></View>
      </View>
      {comparison.map(row => <View key={row.feature} style={styles.tableRow} accessible accessibilityLabel={`${row.feature}. Free: ${row.free}. Pro: ${row.pro}.`}>
        <View style={styles.featureColumn}><Label kind="caption" style={{ fontWeight: '600' }}>{row.feature}</Label></View>
        <View style={styles.planColumn}><Label kind="caption" style={uiStyles.muted}>{row.free}</Label></View>
        <View style={[styles.planColumn, styles.proColumn]}><Label kind="caption" style={{ color: colors.primary, fontWeight: '600' }}>{row.pro}</Label></View>
      </View>)}
    </View>

    <View style={{ gap: 12 }}>
      <Label style={{ fontWeight: '600' }}>Planned for Pro</Label>
      <View style={[uiStyles.row, { alignItems: 'flex-start' }]}><Icon name="time-outline" size={19} color={colors.muted} /><Label kind="caption" style={[uiStyles.muted, { flex: 1 }]}>Multiple collections, graded-card prices and CSV export are not available yet.</Label></View>
    </View>

    <View style={styles.purchaseStatus}>
      <Icon name="information-circle-outline" color={colors.muted} size={21} />
      <View style={{ flex: 1, gap: 4 }}><Label style={{ fontWeight: '600' }}>Purchases are not connected</Label><Label kind="caption" style={uiStyles.muted}>No payment is taken. Pro access is a local development simulation.</Label></View>
    </View>
    <Button title="Continue with Free" onPress={close} />
    {__DEV__ ? <Label kind="caption" style={{ color: colors.muted, textAlign: 'center' }}>Preview Pro using the development switch in Profile.</Label> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  proMark: { width: 56, height: 56, backgroundColor: colors.primarySoft, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, minHeight: 56 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, minHeight: 72 },
  featureColumn: { width: '40%', justifyContent: 'center', paddingVertical: 15, paddingRight: 10 },
  planColumn: { width: '30%', justifyContent: 'center', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 7 },
  proColumn: { backgroundColor: colors.primarySoft },
  purchaseStatus: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 20, borderTopWidth: 1, borderColor: colors.border },
});
