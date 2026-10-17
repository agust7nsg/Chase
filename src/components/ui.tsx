import { type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, type ColorValue, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, type TextProps, View, type ViewStyle } from 'react-native';
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
export function Screen({ children, scroll = true, style, safeTop = true }: { children: ReactNode; scroll?: boolean; style?: ViewStyle; safeTop?: boolean }) {
  return <SafeAreaView style={styles.safe} edges={safeTop ? ['top', 'left', 'right'] : ['bottom', 'left', 'right']}>
    {scroll ? <ScrollView contentContainerStyle={[styles.content, style]} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[styles.content, { flex: 1 }, style]}>{children}</View>}
  </SafeAreaView>;
}
export function Button({ title, onPress, variant = 'primary', icon, disabled = false, loading = false, accessibilityLabel }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse'; icon?: IconName; disabled?: boolean; loading?: boolean; accessibilityLabel?: string;
}) {
  const foreground = variant === 'primary' ? colors.white : variant === 'danger' ? colors.danger : colors.primary;
  return <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
    accessibilityState={{ disabled: disabled || loading, busy: loading }} style={({ pressed }) => [styles.button, styles[variant], (pressed || disabled || loading) && { opacity: 0.6 }]}>
    {loading ? <ActivityIndicator color={foreground} /> : icon ? <Icon name={icon} color={foreground} /> : null}
    <Label style={{ color: foreground, fontWeight: '600', textAlign: 'center', flexShrink: 1 }}>{title}</Label>
  </Pressable>;
}
export function SearchField({ style, ...props }: TextInputProps) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}>
    <Icon name="search-outline" size={20} color={colors.muted} />
    <TextInput {...props} style={[{ flex: 1, minWidth: 0, minHeight: 52, paddingVertical: 14, fontSize: 16, color: colors.text }, style]} />
  </View>;
}
export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}
export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'neutral' | 'warm' }) {
  return <View style={[styles.badge, tone === 'neutral' && { backgroundColor: colors.subtle }, tone === 'warm' && { backgroundColor: colors.warm }]}><Label kind="caption" style={{ color: tone === 'warm' ? colors.warmText : tone === 'neutral' ? colors.muted : colors.primary, fontWeight: '600' }}>{children}</Label></View>;
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
  between: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stack: { gap: 16 }, muted: { color: colors.muted },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 16, fontSize: 16, color: colors.text, backgroundColor: colors.white },
});
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: 24, paddingBottom: 32, gap: 24, width: '100%', maxWidth: 760, alignSelf: 'center' },
  text: { color: colors.text, flexShrink: 1 }, body: { fontSize: 16, lineHeight: 24 }, title: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.9 },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: '600', flexShrink: 1 }, caption: { fontSize: 13, lineHeight: 19 }, eyebrow: { fontSize: 12, lineHeight: 18, fontWeight: '700', letterSpacing: 1.5 },
  price: { fontSize: 40, lineHeight: 48, fontWeight: '700', letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  button: { minHeight: 54, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  inverse: { backgroundColor: colors.white }, primary: { backgroundColor: colors.primary }, secondary: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1 }, ghost: { backgroundColor: 'transparent' }, danger: { backgroundColor: '#FEF2F2' },
  panel: { borderRadius: 16, backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, padding: 20, gap: 16 },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, textAction: { minHeight: 48, paddingHorizontal: 4, justifyContent: 'center' },
  empty: { paddingVertical: 28, paddingHorizontal: 12, gap: 12, alignItems: 'center' }, emptyIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  setting: { minHeight: 64, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomColor: colors.border, borderBottomWidth: 1 },
});
