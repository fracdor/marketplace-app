import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { ProfileForm } from '@/features/auth/ProfileForm';
import { useAuth } from '@/features/auth/useAuth';
import { saveProfile } from '@/features/auth/actions';

export default function OnboardingScreen() {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-white text-2xl font-extrabold text-center mb-6">Completa tu perfil</Text>
      <Card>
        <ProfileForm onSubmit={async (input) => {
          if (!session) return;
          await saveProfile(session.user.id, input);
          await refreshProfile();
          // Route through the gate (not straight to /(tabs)) so it re-decides
          // from the freshly-fetched profile — if refreshProfile silently failed
          // (fetchProfile returns null on error), the gate keeps the user in
          // onboarding instead of stranding them in tabs with a null profile.
          router.replace('/');
        }} />
      </Card>
    </View>
  );
}
