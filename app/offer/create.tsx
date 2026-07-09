import { View, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { OfferForm } from '@/components/offers/OfferForm';
import { useCreateOffer } from '@/features/offers/hooks';
import type { CreateOfferInput } from '@/features/offers/types';

export default function CreateOfferScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const router = useRouter();
  const { mutateAsync } = useCreateOffer();

  const onSubmit = async (input: CreateOfferInput) => {
    await mutateAsync(input);
    router.back();
  };

  return (
    <View className="flex-1 bg-white px-5 pt-4">
      <Stack.Screen options={{ headerShown: true, title: 'Ofertar' }} />
      <Text className="text-xl font-extrabold text-slate-900 mb-4">Enviar oferta</Text>
      <OfferForm taskId={taskId} onSubmit={onSubmit} />
    </View>
  );
}
