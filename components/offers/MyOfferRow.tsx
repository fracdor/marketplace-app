import { Pressable, Text, View } from 'react-native';
import { formatBudget } from '@/features/tasks/format';
import type { MyOfferWithTask } from '@/features/offers/types';

const STATUS_LABEL: Record<MyOfferWithTask['status'], string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  withdrawn: 'Retirada',
};

interface MyOfferRowProps {
  offer: MyOfferWithTask;
  onWithdraw: () => void;
}

export function MyOfferRow({ offer, onWithdraw }: MyOfferRowProps) {
  return (
    <View testID="my-offer-row" className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
      <Text className="text-slate-900 font-bold text-sm">{offer.task?.title ?? 'Tarea ya no disponible'}</Text>
      <Text className="text-slate-500 text-xs mt-1">
        {formatBudget(offer.price)} · {STATUS_LABEL[offer.status]}
      </Text>
      {offer.status === 'pending' ? (
        <Pressable
          testID="withdraw-offer-button"
          accessibilityRole="button"
          onPress={onWithdraw}
          className="mt-3 bg-red-500 px-3 py-2 rounded-xl self-start"
        >
          <Text className="text-white font-bold text-xs">Retirar oferta</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
