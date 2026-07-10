// app/(tabs)/profile.tsx
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/useAuth';
import { saveProfile, signOut } from '@/features/auth/actions';
import { ProfileForm } from '@/features/auth/ProfileForm';
import { Button } from '@/components/ui/Button';
import type { ProfileInput } from '@/features/auth/schemas';

type Mode = 'view' | 'edit';

export default function ProfileTab() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const [mode, setMode] = useState<Mode>('view');

  if (!session) return null; // brief window before the app's own gate would already have redirected

  if (!profile) {
    // Reachable in practice, not just a mount-time gap: fetchProfile swallows
    // errors and returns null rather than throwing, so a transient failure in
    // the post-save refreshProfile() call (see handleSave below) can leave
    // profile null here even after a successful save. Give the user a way
    // out instead of a permanently blank screen.
    return (
      <View className="flex-1 items-center justify-center px-6 bg-white">
        <Text className="text-slate-500 text-center mb-4">No pudimos cargar tu perfil.</Text>
        <Button label="Reintentar" onPress={() => refreshProfile()} />
      </View>
    );
  }

  const handleSave = async (input: ProfileInput) => {
    await saveProfile(session.user.id, input);
    await refreshProfile();
    setMode('view');
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/'); // back through the gate, consistent with signIn/signUp
  };

  return (
    <View className="flex-1 bg-white px-6 pt-8">
      {mode === 'view' ? (
        <View className="items-center">
          <View className="w-16 h-16 rounded-full bg-slate-200 mb-3" />
          <Text className="text-lg font-bold text-slate-900">{profile.full_name}</Text>
          <Text className="text-slate-500 text-sm">{profile.city}</Text>
          <Text className="text-slate-400 text-xs mt-1">★ nuevo</Text>

          <View className="w-full border-t border-slate-100 mt-6 pt-4 items-center">
            <Text className="text-slate-500 text-sm">
              +57 {profile.phone}
            </Text>
            <Text className="text-brand text-xs mt-1">✓ Verificado</Text>
          </View>

          <View className="w-full mt-6 gap-3">
            <Button label="Editar perfil" onPress={() => setMode('edit')} />
            <Button label="Cerrar sesión" variant="ghost" onPress={handleSignOut} />
          </View>
        </View>
      ) : (
        <View>
          <ProfileForm
            onSubmit={handleSave}
            initialValues={{ full_name: profile.full_name ?? '', city: profile.city ?? '' }}
            submitLabel="Guardar"
          />
          <Button label="Cancelar" variant="ghost" onPress={() => setMode('view')} />
        </View>
      )}
    </View>
  );
}
