import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { OfferListItem } from '@/components/offers/OfferListItem';
import { formatBudget } from '@/features/tasks/format';
import type { TaskWithRelations } from '@/features/tasks/types';
import type { OfferWithFreelancer } from '@/features/offers/types';

interface TaskActionZoneProps {
  task: TaskWithRelations;
  offers: OfferWithFreelancer[];
  myId: string | undefined;
  accepting: boolean;
  withdrawing: boolean;
  completing: boolean;
  onAccept: (offerId: string, freelancerName: string, price: number) => void;
  onWithdraw: (offerId: string) => void;
  onComplete: () => void;
  onOffer: () => void;
}

export function TaskActionZone({
  task,
  offers,
  myId,
  accepting,
  withdrawing,
  completing,
  onAccept,
  onWithdraw,
  onComplete,
  onOffer,
}: TaskActionZoneProps) {
  const isOwner = task.client_id === myId;
  const isAssignedFreelancer = task.assigned_freelancer_id !== null && task.assigned_freelancer_id === myId;

  if (isOwner) {
    if (task.status === 'open') {
      if (offers.length === 0) {
        return (
          <Text className="text-slate-500 text-sm text-center">
            Aún no has recibido ofertas para esta tarea.
          </Text>
        );
      }
      return (
        <View>
          {offers.map((offer) => (
            <OfferListItem
              key={offer.id}
              offer={offer}
              disabled={accepting}
              onAccept={() => onAccept(offer.id, offer.freelancer.full_name ?? 'Anónimo', offer.price)}
            />
          ))}
        </View>
      );
    }
    if (task.status === 'assigned') {
      const winner = offers.find((o) => o.status === 'accepted');
      return (
        <View>
          <Text className="text-slate-500 text-sm mb-3">
            Asignada a {winner?.freelancer.full_name ?? 'freelancer'}
          </Text>
          <Pressable
            testID="complete-task-button"
            accessibilityRole="button"
            onPress={onComplete}
            disabled={completing}
            className="bg-brand rounded-xl h-11 items-center justify-center"
          >
            {completing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-bold text-sm">Marcar como completada</Text>
            )}
          </Pressable>
        </View>
      );
    }
    if (task.status === 'completed') {
      const winner = offers.find((o) => o.status === 'accepted');
      return (
        <Text className="text-slate-500 text-sm text-center">
          Tarea completada{winner?.freelancer.full_name ? ` · ${winner.freelancer.full_name}` : ''}
        </Text>
      );
    }
    return <Text className="text-slate-400 text-sm text-center">Tarea cancelada.</Text>;
  }

  if (isAssignedFreelancer) {
    if (task.status === 'assigned') {
      return (
        <Text className="text-slate-500 text-sm text-center">
          Te asignaron esta tarea. Contacta al cliente para coordinar.
        </Text>
      );
    }
    return <Text className="text-slate-500 text-sm text-center">Trabajo completado.</Text>;
  }

  const myOffer = offers.find((o) => o.freelancer_id === myId);
  if (!myOffer) {
    return (
      <Pressable
        testID="offer-button"
        accessibilityRole="button"
        onPress={onOffer}
        className="bg-brand rounded-xl h-11 items-center justify-center"
      >
        <Text className="text-white font-bold text-sm">Ofertar</Text>
      </Pressable>
    );
  }
  if (myOffer.status === 'pending') {
    return (
      <View>
        <Text className="text-slate-500 text-sm mb-3">
          Ya ofertaste {formatBudget(myOffer.price)} · Pendiente
        </Text>
        <Pressable
          testID="withdraw-offer-button"
          accessibilityRole="button"
          onPress={() => onWithdraw(myOffer.id)}
          disabled={withdrawing}
          className="bg-red-500 rounded-xl h-11 items-center justify-center"
        >
          {withdrawing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-sm">Retirar oferta</Text>
          )}
        </Pressable>
      </View>
    );
  }
  return <Text className="text-slate-400 text-sm text-center">Ya no puedes ofertar en esta tarea.</Text>;
}
