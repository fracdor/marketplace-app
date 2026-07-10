import { ActivityIndicator, Pressable, Text, View } from 'react-native';
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
  disabled?: boolean;
}

export function MyOfferRow({ offer, onWithdraw, disabled }: MyOfferRowProps) {
  // A pending offer's task can be cancelled without anything transitioning
  // the offer itself — offers has no trigger/RPC for this, see the plan's
  // "Before you start" and the design spec. Surface it here instead.
  const isOrphanedByCancelledTask = offer.status === 'pending' && offer.task?.status === 'cancelled';
  const statusText = isOrphanedByCancelledTask ? 'Tarea cancelada' : STATUS_LABEL[offer.status];

  return (
    <View testID="my-offer-row" className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
      <Text className="text-slate-900 font-bold text-sm">{offer.task?.title ?? 'Tarea ya no disponible'}</Text>
      <Text className="text-slate-500 text-xs mt-1">
        {formatBudget(offer.price)} · {statusText}
      </Text>
      {offer.status === 'pending' && !isOrphanedByCancelledTask ? (
        <Pressable
          testID="withdraw-offer-button"
          accessibilityRole="button"
          onPress={onWithdraw}
          disabled={disabled}
          className="mt-3 bg-red-500 px-3 py-2 rounded-xl self-start"
        >
          {disabled ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-xs">Retirar oferta</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
