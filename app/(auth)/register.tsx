import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { RegisterForm } from '@/features/auth/RegisterForm';
import { signUp } from '@/features/auth/actions';

export default function RegisterScreen() {
  const router = useRouter();
  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-white text-2xl font-extrabold text-center mb-6">Crear cuenta</Text>
      <Card>
        <RegisterForm onSubmit={async (email, password) => { await signUp(email, password); router.replace('/'); }} />
        <Pressable onPress={() => router.back()}>
          <Text className="text-brand text-center mt-4 font-semibold">Ya tengo cuenta</Text>
        </Pressable>
      </Card>
    </View>
  );
}
