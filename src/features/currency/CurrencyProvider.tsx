import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Label } from '@/components/ui';
import { CURRENCY_NAMES, DISPLAY_CURRENCIES, formatUsd, normalizeDisplayCurrency, SAMPLE_USD_TO_EUR, type DisplayCurrency } from '@/services/currency';
import { colors } from '@/theme/tokens';

const STORAGE_KEY = 'chase.currency.v1';
type CurrencyContextValue = {
  currency: DisplayCurrency;
  formatMoney: (usdAmount: number) => string;
  openCurrencySelector: () => void;
};
const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<DisplayCurrency>('USD');
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState<DisplayCurrency | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).catch(() => null).then(stored => {
      if (active) { setCurrency(normalizeDisplayCurrency(stored)); setReady(true); }
    });
    return () => { active = false; };
  }, []);

  const close = () => { if (!saving.current) { setVisible(false); setError(null); } };
  const select = async (next: DisplayCurrency) => {
    if (saving.current) return;
    if (next === currency) { close(); return; }
    saving.current = true; setPending(next); setError(null);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
      setCurrency(next); setVisible(false);
    } catch {
      setError('Could not save currency. Try again.');
    } finally { saving.current = false; setPending(null); }
  };

  return <CurrencyContext.Provider value={{ currency, formatMoney: amount => formatUsd(amount, currency), openCurrencySelector: () => { setError(null); setVisible(true); } }}>
    {ready ? children : <View style={styles.loading}><ActivityIndicator color={colors.primary} accessibilityLabel="Opening Chase" /></View>}
    <Modal visible={visible} transparent animationType="none" presentationStyle="overFullScreen" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false} focusable={false} tabIndex={-1} importantForAccessibility="no" />
        <View style={styles.dialog} role="dialog" accessibilityLabel="Currency" accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <View style={styles.header}>
              <Label kind="heading" accessibilityRole="header">Currency</Label>
              <Pressable accessibilityRole="button" accessibilityLabel="Close currency selector" disabled={pending !== null} onPress={close} style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}><Icon name="close" color={colors.muted} /></Pressable>
            </View>
            <View accessibilityRole="radiogroup" accessibilityLabel="Display currency">
              {DISPLAY_CURRENCIES.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={`${CURRENCY_NAMES[option]} (${option})`} accessibilityState={{ checked: currency === option, disabled: pending !== null, busy: pending === option }} aria-checked={currency === option} disabled={pending !== null} onPress={() => { void select(option); }} style={({ pressed }) => [styles.option, currency === option && styles.selected, pressed && { opacity: 0.6 }]}>
                <View style={{ gap: 2, flex: 1 }}><Label style={{ fontWeight: '600' }}>{CURRENCY_NAMES[option]}</Label><Label kind="caption" style={{ color: colors.muted }}>{option}</Label></View>
                {pending === option ? <ActivityIndicator color={colors.primary} /> : currency === option ? <Icon name="checkmark-circle" color={colors.primary} /> : <Icon name="ellipse-outline" color={colors.border} />}
              </Pressable>)}
            </View>
            <Label kind="caption" style={styles.rate}>Sample rate · 1 USD = {SAMPLE_USD_TO_EUR.toFixed(2)} EUR</Label>
            {error ? <Label accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Label> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used inside CurrencyProvider.');
  return context;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
  dialog: { width: '100%', maxWidth: 360, maxHeight: '85%', borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface },
  content: { padding: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64, borderRadius: 12 },
  selected: { backgroundColor: colors.primarySoft },
  rate: { color: colors.muted, textAlign: 'center' },
});
