import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PhoneForm } from '@/features/auth/PhoneForm';
import { useAuth } from '@/features/auth/useAuth';
import { sendPhoneCode, verifyPhoneCode } from '@/features/auth/actions';

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-white text-2xl font-extrabold text-center mb-6">Verifica tu celular</Text>
      <Card>
        {!phone ? (
          <PhoneForm onSubmit={async (p) => { await sendPhoneCode(p); setPhone(p); }} />
        ) : (
          <View>
            <Input label="Código (dev: 123456)" testID="code-input" keyboardType="number-pad"
              value={code} onChangeText={setCode} error={error ?? undefined} />
            <Button label="Verificar" loading={loading} onPress={async () => {
              if (!session) return;
              setLoading(true); setError(null);
              try {
                await verifyPhoneCode(session.user.id, phone, code);
                await refreshProfile();
                router.replace('/(auth)/onboarding');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Error');
              } finally {
                setLoading(false);
              }
            }} />
          </View>
        )}
      </Card>
    </View>
  );
}
