import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { LoginForm } from '@/features/auth/LoginForm';
import { signIn } from '@/features/auth/actions';

export default function LoginScreen() {
  const router = useRouter();
  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-white text-2xl font-extrabold text-center mb-1">Ingresar</Text>
      <Text className="text-white/80 text-center mb-6">Bienvenido de vuelta</Text>
      <Card>
        <LoginForm onSubmit={async (email, password) => { await signIn(email, password); router.replace('/'); }} />
        <Pressable onPress={() => router.push('/(auth)/register')}>
          <Text className="text-brand text-center mt-4 font-semibold">Crear cuenta</Text>
        </Pressable>
      </Card>
    </View>
  );
}
