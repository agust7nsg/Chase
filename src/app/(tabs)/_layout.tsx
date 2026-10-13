import { Redirect, Tabs } from 'expo-router';
import { Icon } from '@/components/ui';
import { useChase } from '@/features/app/ChaseProvider';
import { colors } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
export default function TabLayout() {
  const { state } = useChase();
  const insets = useSafeAreaInsets();
  if (!state.onboardingComplete) return <Redirect href="/onboarding" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border, height: 64 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6) }, tabBarLabelStyle: { fontSize: 12, fontWeight: '600', lineHeight: 16 } }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <Icon name={focused ? 'home' : 'home-outline'} color={color} /> }} />
    <Tabs.Screen name="collection" options={{ title: 'Collection', tabBarIcon: ({ color, focused }) => <Icon name={focused ? 'albums' : 'albums-outline'} color={color} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => <Icon name={focused ? 'person-circle' : 'person-circle-outline'} color={color} /> }} />
  </Tabs>;
}
