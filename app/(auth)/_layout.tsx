import { Stack } from 'expo-router';
import { GradientBackground } from '@/components/ui/GradientBackground';

export default function AuthLayout() {
  return (
    <GradientBackground>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
    </GradientBackground>
  );
}
