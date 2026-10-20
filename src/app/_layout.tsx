import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChaseProvider, useChase } from '@/features/app/ChaseProvider';
import { Button, Label, Screen } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { CurrencyProvider } from '@/features/currency/CurrencyProvider';
import { ScanSessionProvider } from '@/features/scanner/ScanSessionProvider';

function Navigator() {
  const { ready, loadError, retryLoad, persistenceError } = useChase();
  if (loadError) return <Screen><Label kind="title">Your collection is safe</Label><Label>{loadError}</Label><Button title="Retry loading" onPress={retryLoad} /></Screen>;
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.white, gap: 16 }}><ActivityIndicator color={colors.primary} /><Label>Opening Chase…</Label></View>;
  return <View style={{ flex: 1 }}>
    {persistenceError ? <View style={{ backgroundColor: '#FEF2F2', padding: 16 }}><Label kind="caption" accessibilityRole="alert">{persistenceError}</Label></View> : null}
    <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: colors.text, headerStyle: { backgroundColor: colors.background }, headerTitleStyle: { fontSize: 16, fontWeight: '600' }, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="scanner" options={{ headerShown: false }} />
      <Stack.Screen name="organize" options={{ headerShown: false }} />
      <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen name="my-cards" options={{ title: '' }} />
      <Stack.Screen name="search" options={{ title: '' }} />
      <Stack.Screen name="card/[id]" options={{ title: '' }} />
      <Stack.Screen name="match-scan/[id]" options={{ title: 'Match printing' }} />
      <Stack.Screen name="account" options={{ title: 'Account & settings' }} />
    </Stack>
  </View>;
}
export default function RootLayout() {
  return <SafeAreaProvider><CurrencyProvider><ChaseProvider><ScanSessionProvider><StatusBar style="dark" /><Navigator /></ScanSessionProvider></ChaseProvider></CurrencyProvider></SafeAreaProvider>;
}
