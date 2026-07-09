import type { ReactElement } from 'react';
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

// Explicit `: ReactElement` return type + a switch with no `default` case is
// what makes this exhaustive over TaskStatus: if a 5th status is ever added,
// tsc fails with "not all code paths return a value" until every branch
// below handles it. Matches the technique PublishedTaskRow.statusLine uses.
function renderOwnerZone(
  task: TaskWithRelations,
  offers: OfferWithFreelancer[],
  accepting: boolean,
  completing: boolean,
  onAccept: (offerId: string, freelancerName: string, price: number) => void,
  onComplete: () => void,
): ReactElement {
  switch (task.status) {
    case 'open': {
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
    case 'assigned': {
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
    case 'completed': {
      // winner should always be found here: enforce_task_status_transitions()
      // (supabase/migrations/20260702000003_create_tasks.sql) only allows
      // completed to be reached from assigned, and assigned_freelancer_id is
      // only ever set together with an open->assigned transition performed by
      // accept_offer() — which accepts the winning offer in the same
      // transaction. The `?? ''` fallback is defensive only.
      const winner = offers.find((o) => o.status === 'accepted');
      return (
        <Text className="text-slate-500 text-sm text-center">
          Tarea completada{winner?.freelancer.full_name ? ` · ${winner.freelancer.full_name}` : ''}
        </Text>
      );
    }
    case 'cancelled':
      return <Text className="text-slate-400 text-sm text-center">Tarea cancelada.</Text>;
  }
}

function renderAssignedFreelancerZone(task: TaskWithRelations): ReactElement | null {
  switch (task.status) {
    case 'assigned':
      return (
        <Text className="text-slate-500 text-sm text-center">
          Te asignaron esta tarea. Contacta al cliente para coordinar.
        </Text>
      );
    case 'completed':
      return <Text className="text-slate-500 text-sm text-center">Trabajo completado.</Text>;
    case 'open':
    case 'cancelled':
      // Unreachable in practice: assigned_freelancer_id only changes together
      // with an open->assigned transition via accept_offer() (see
      // enforce_task_status_transitions() in
      // supabase/migrations/20260702000003_create_tasks.sql), so a caller who
      // is the assigned_freelancer can only ever observe 'assigned' or
      // 'completed' here — never the pre-assignment 'open' or a 'cancelled'
      // task (cancellation is only reachable from 'open', before assignment).
      return null;
  }
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
    return renderOwnerZone(task, offers, accepting, completing, onAccept, onComplete);
  }

  if (isAssignedFreelancer) {
    return renderAssignedFreelancerZone(task);
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
  // Covers 'rejected' and 'withdrawn', plus the technically-unreachable
  // 'accepted': accept_offer() sets assigned_freelancer_id to the accepted
  // offer's freelancer_id in the same transaction, so a caller whose own
  // offer is 'accepted' would already be isAssignedFreelancer above and never
  // reach this branch. offer_insert_is_valid/offers_insert_own (see
  // supabase/migrations/20260702000004_create_offers.sql) also guarantee
  // client_id <> freelancer_id, so isOwner and isAssignedFreelancer can never
  // both be true for the same task.
  return <Text className="text-slate-400 text-sm text-center">Ya no puedes ofertar en esta tarea.</Text>;
}
