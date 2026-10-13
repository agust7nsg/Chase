import { type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, type ColorValue, Pressable, ScrollView, StyleSheet, Text, type TextProps, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 22, color = colors.text }: { name: IconName; size?: number; color?: ColorValue }) {
  return <Ionicons name={name} size={size} color={color} accessible={false} />;
}
export function Label({ children, kind = 'body', style, ...props }: TextProps & { kind?: 'body' | 'title' | 'heading' | 'caption' | 'eyebrow' | 'price' }) {
  return <Text {...props} style={[styles.text, styles[kind], style]}>{children}</Text>;
}
export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    {scroll ? <ScrollView contentContainerStyle={[styles.content, style]} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[styles.content, { flex: 1 }, style]}>{children}</View>}
  </SafeAreaView>;
}
export function Button({ title, onPress, variant = 'primary', icon, disabled = false, loading = false, accessibilityLabel }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName; disabled?: boolean; loading?: boolean; accessibilityLabel?: string;
}) {
  const foreground = variant === 'primary' ? colors.white : variant === 'danger' ? colors.danger : colors.primary;
  return <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
    accessibilityState={{ disabled: disabled || loading, busy: loading }} style={({ pressed }) => [styles.button, styles[variant], (pressed || disabled || loading) && { opacity: 0.6 }]}>
    {loading ? <ActivityIndicator color={foreground} /> : icon ? <Icon name={icon} color={foreground} /> : null}
    <Label style={{ color: foreground, fontWeight: '600', textAlign: 'center', flexShrink: 1 }}>{title}</Label>
  </Pressable>;
}
export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}
export function Badge({ children }: { children: ReactNode }) {
  return <View style={styles.badge}><Label kind="caption" style={{ color: colors.primary, fontWeight: '600' }}>{children}</Label></View>;
}
export function Section({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={styles.section}><Label kind="heading" accessibilityRole="header">{title}</Label>{action && onPress ? <Pressable onPress={onPress} accessibilityRole="button" style={styles.textAction}><Label style={{ color: colors.primary, fontWeight: '600' }}>{action}</Label></Pressable> : null}</View>;
}
export function EmptyState({ title, message, action, onPress, icon = 'albums-outline' }: { title: string; message: string; action?: string; onPress?: () => void; icon?: IconName }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Icon name={icon} size={30} color={colors.primary} /></View><Label kind="heading" style={{ textAlign: 'center' }}>{title}</Label><Label style={{ color: colors.muted, textAlign: 'center' }}>{message}</Label>{action && onPress ? <Button title={action} onPress={onPress} variant="secondary" /> : null}</View>;
}
export function SettingRow({ title, subtitle, icon, onPress, danger = false }: { title: string; subtitle?: string; icon: IconName; onPress: () => void; danger?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.setting, pressed && { backgroundColor: colors.surface }]}>
    <Icon name={icon} color={danger ? colors.danger : colors.muted} /><View style={{ flex: 1, gap: 4 }}><Label style={{ color: danger ? colors.danger : colors.text }}>{title}</Label>{subtitle ? <Label kind="caption" style={{ color: colors.muted }}>{subtitle}</Label> : null}</View><Icon name="chevron-forward" size={18} color={colors.muted} />
  </Pressable>;
}
export const uiStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stack: { gap: 16 }, muted: { color: colors.muted },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
});
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: 24, paddingBottom: 40, gap: 24, width: '100%', maxWidth: 760, alignSelf: 'center' },
  text: { color: colors.text }, body: { fontSize: 16, lineHeight: 24 }, title: { fontSize: 32, lineHeight: 39, fontWeight: '700', letterSpacing: -0.6 },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: '600', flexShrink: 1 }, caption: { fontSize: 13, lineHeight: 19 }, eyebrow: { fontSize: 12, lineHeight: 18, fontWeight: '700', letterSpacing: 1.5 },
  price: { fontSize: 36, lineHeight: 44, fontWeight: '700', fontVariant: ['tabular-nums'] },
  button: { minHeight: 52, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  primary: { backgroundColor: colors.primary }, secondary: { backgroundColor: colors.primarySoft, borderColor: '#DBEAFE', borderWidth: 1 }, ghost: { backgroundColor: 'transparent' }, danger: { backgroundColor: '#FEF2F2' },
  panel: { borderRadius: 16, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, padding: 20, gap: 16 },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, textAction: { minHeight: 48, paddingHorizontal: 4, justifyContent: 'center' },
  empty: { paddingVertical: 28, paddingHorizontal: 12, gap: 14, alignItems: 'center' }, emptyIcon: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  setting: { minHeight: 64, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomColor: colors.border, borderBottomWidth: 1 },
});
