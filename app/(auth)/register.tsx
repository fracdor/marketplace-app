import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { RegisterForm } from '@/features/auth/RegisterForm';
import { signUp } from '@/features/auth/actions';

export default function RegisterScreen() {
  const router = useRouter();
  const [emailSent, setEmailSent] = useState(false);
  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-white text-2xl font-extrabold text-center mb-6">Crear cuenta</Text>
      <Card>
        {emailSent ? (
          <Text className="text-slate-600 text-center">
            Revisa tu correo para confirmar tu cuenta y luego vuelve a ingresar.
          </Text>
        ) : (
          <RegisterForm
            onSubmit={async (email, password) => {
              const { needsEmailConfirmation } = await signUp(email, password);
              if (needsEmailConfirmation) setEmailSent(true);
              else router.replace('/');
            }}
          />
        )}
        <Pressable onPress={() => router.back()}>
          <Text className="text-brand text-center mt-4 font-semibold">Ya tengo cuenta</Text>
        </Pressable>
      </Card>
    </View>
  );
}
