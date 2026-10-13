import { Redirect } from 'expo-router';
import { useChase } from '@/features/app/ChaseProvider';
export default function Index() {
  const { state } = useChase();
  return <Redirect href={state.onboardingComplete ? '/(tabs)' : '/onboarding'} />;
}
