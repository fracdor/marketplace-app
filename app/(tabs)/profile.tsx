import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { signOut } from '@/features/auth/actions';
export default function ProfileTab() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center bg-white gap-4 px-6">
      <Text className="text-slate-500">Perfil (próximo sub-proyecto)</Text>
      <Button
        label="Cerrar sesión"
        variant="ghost"
        onPress={async () => {
          await signOut();
          router.replace('/'); // back through the gate, consistent with signIn/signUp
        }}
      />
    </View>
  );
}
