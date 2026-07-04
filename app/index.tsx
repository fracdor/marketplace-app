import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/useAuth';
import { routeFor } from '@/features/auth/gate';

export default function Index() {
  const { loading, session, profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const target = routeFor(session ? { userId: session.user.id } : null, profile);
    if (target === '(auth)') router.replace('/(auth)/login');
    else if (target === 'onboarding')
      // Skip phone step if already verified; only profile details remain.
      router.replace(profile?.phone_verified ? '/(auth)/onboarding' : '/(auth)/verify-phone');
    else router.replace('/(tabs)');
  }, [loading, session, profile, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
