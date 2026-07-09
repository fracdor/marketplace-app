import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTask, useCompleteTask } from '@/features/tasks/hooks';
import { useOffersForTask, useAcceptOffer, useWithdrawOffer } from '@/features/offers/hooks';
import { useAuth } from '@/features/auth/useAuth';
import { formatBudget, formatRelativeTime } from '@/features/tasks/format';
import { mapAuthError } from '@/features/auth/errors';
import { TaskActionZone } from '@/components/tasks/TaskActionZone';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { data: task, isPending: taskPending, isError: taskError, refetch: refetchTask } = useTask(id);
  const {
    data: offers,
    isPending: offersPending,
    isError: offersError,
    refetch: refetchOffers,
  } = useOffersForTask(id);
  const { mutateAsync: acceptOffer, isPending: accepting } = useAcceptOffer();
  const { mutateAsync: withdrawOffer, isPending: withdrawing } = useWithdrawOffer();
  const { mutateAsync: completeTask, isPending: completing } = useCompleteTask();
  const [actionError, setActionError] = useState<string | null>(null);

  const isPending = taskPending || offersPending;
  const isError = taskError || offersError;
  const refetch = () => {
    refetchTask();
    refetchOffers();
  };

  const confirmAccept = async (offerId: string) => {
    setActionError(null);
    try {
      await acceptOffer({ offerId, taskId: id });
    } catch (e) {
      setActionError(e instanceof Error ? mapAuthError(e.message) : 'Error al aceptar la oferta');
    }
  };

  const handleAccept = (offerId: string, freelancerName: string, price: number) => {
    Alert.alert(
      'Aceptar oferta',
      `¿Aceptar la oferta de ${freelancerName} por ${formatBudget(price)}? Se rechazarán las demás ofertas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aceptar', onPress: () => confirmAccept(offerId) },
      ],
    );
  };

  const handleWithdraw = async (offerId: string) => {
    setActionError(null);
    try {
      await withdrawOffer({ offerId, taskId: id });
    } catch (e) {
      setActionError(e instanceof Error ? mapAuthError(e.message) : 'Error al retirar la oferta');
    }
  };

  const handleComplete = async () => {
    setActionError(null);
    try {
      await completeTask(id);
    } catch (e) {
      setActionError(e instanceof Error ? mapAuthError(e.message) : 'Error al completar la tarea');
    }
  };

  return (
    <View className="flex-1 bg-white">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Detalle de tarea',
          headerStyle: { backgroundColor: '#0f766e' },
          headerTintColor: '#ffffff',
        }}
      />
      {isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : isError || !task ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-slate-500 text-center mb-4">No pudimos cargar esta tarea.</Text>
          <Pressable onPress={() => refetch()} className="bg-brand px-4 py-2 rounded-xl">
            <Text className="text-white font-bold">Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView className="flex-1 px-5 pt-4">
            <View className="bg-brand/10 px-2 py-1 rounded-full self-start">
              <Text className="text-brand text-xs font-bold">{task.category.name}</Text>
            </View>
            <Text className="text-slate-900 text-xl font-extrabold mt-3">{task.title}</Text>
            <Text className="text-slate-500 text-xs mt-2">
              {task.city} · {formatRelativeTime(task.created_at)} · ★ nuevo
            </Text>

            <View className="bg-slate-50 rounded-2xl p-4 mt-4 flex-row justify-between items-center">
              <Text className="text-slate-500 text-xs">Presupuesto de referencia</Text>
              <Text className="text-brand text-lg font-extrabold">{formatBudget(task.budget_reference)}</Text>
            </View>

            <Text className="text-slate-600 text-xs font-bold uppercase mt-5">Descripción</Text>
            <Text className="text-slate-700 text-sm mt-2 leading-5">{task.description}</Text>

            <Text className="text-slate-600 text-xs font-bold uppercase mt-5">Publicado por</Text>
            <View className="flex-row items-center gap-2 mt-2 mb-6">
              <View className="w-8 h-8 rounded-full bg-slate-200" />
              <Text className="text-slate-900 text-sm font-semibold">
                {task.client.full_name ?? 'Anónimo'}
              </Text>
            </View>
          </ScrollView>
          <View className="border-t border-slate-100 px-5 py-4">
            {actionError ? <Text className="text-xs text-red-500 mb-2">{actionError}</Text> : null}
            <TaskActionZone
              task={task}
              offers={offers ?? []}
              myId={session?.user.id}
              accepting={accepting}
              withdrawing={withdrawing}
              completing={completing}
              onAccept={handleAccept}
              onWithdraw={handleWithdraw}
              onComplete={handleComplete}
              onOffer={() => router.push({ pathname: '/offer/create', params: { taskId: task.id } })}
            />
          </View>
        </>
      )}
    </View>
  );
}
