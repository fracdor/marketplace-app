import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PublishedTaskRow } from '@/components/tasks/PublishedTaskRow';
import { MyOfferRow } from '@/components/offers/MyOfferRow';
import { useMyTasks, useCancelTask } from '@/features/tasks/hooks';
import { useMyOffers, useWithdrawOffer } from '@/features/offers/hooks';
import { mapAuthError } from '@/features/auth/errors';
import type { MyPublishedTask } from '@/features/tasks/types';
import type { MyOfferWithTask } from '@/features/offers/types';

type SubTab = 'published' | 'jobs';

export default function MyTasks() {
  const [subTab, setSubTab] = useState<SubTab>('published');

  return (
    <View className="flex-1 bg-white">
      <View className="flex-row border-b border-slate-200">
        <Pressable
          testID="sub-tab-published"
          accessibilityRole="tab"
          accessibilityState={{ selected: subTab === 'published' }}
          onPress={() => setSubTab('published')}
          className={`flex-1 items-center py-3 border-b-2 ${subTab === 'published' ? 'border-brand' : 'border-transparent'}`}
        >
          <Text className={subTab === 'published' ? 'text-brand font-bold' : 'text-slate-500'}>Publicadas</Text>
        </Pressable>
        <Pressable
          testID="sub-tab-jobs"
          accessibilityRole="tab"
          accessibilityState={{ selected: subTab === 'jobs' }}
          onPress={() => setSubTab('jobs')}
          className={`flex-1 items-center py-3 border-b-2 ${subTab === 'jobs' ? 'border-brand' : 'border-transparent'}`}
        >
          <Text className={subTab === 'jobs' ? 'text-brand font-bold' : 'text-slate-500'}>Trabajos</Text>
        </Pressable>
      </View>
      {subTab === 'published' ? <PublishedTasksList /> : <JobsList />}
    </View>
  );
}

function PublishedTasksList() {
  const router = useRouter();
  const { data, isPending, isError, refetch } = useMyTasks();
  const { mutateAsync: cancelTask, isPending: cancelling } = useCancelTask();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const confirmCancel = async (taskId: string) => {
    setCancelError(null);
    try {
      await cancelTask(taskId);
    } catch (e) {
      setCancelError(e instanceof Error ? mapAuthError(e.message) : 'Error al cancelar la tarea');
    }
  };

  const handleCancel = (taskId: string, offerCount: number) => {
    const message =
      offerCount === 0
        ? '¿Cancelar esta tarea? No podrás reabrirla.'
        : offerCount === 1
          ? '¿Cancelar esta tarea? Se cancelará también 1 oferta recibida. No podrás reabrirla.'
          : `¿Cancelar esta tarea? Se cancelarán también las ${offerCount} ofertas recibidas. No podrás reabrirla.`;
    Alert.alert('Cancelar tarea', message, [
      { text: 'Volver', style: 'cancel' },
      { text: 'Sí, cancelar', onPress: () => confirmCancel(taskId) },
    ]);
  };

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (isError) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-slate-500 text-center mb-4">No pudimos cargar tus tareas.</Text>
        <Pressable onPress={() => refetch()} className="bg-brand px-4 py-2 rounded-xl">
          <Text className="text-white font-bold">Reintentar</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View className="flex-1">
      {cancelError ? (
        <Text className="text-xs text-red-500 text-center mt-2">{cancelError}</Text>
      ) : null}
      <FlatList
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        data={data}
        keyExtractor={(item: MyPublishedTask) => item.id}
        renderItem={({ item }) => (
          <PublishedTaskRow
            task={item}
            onPress={() => router.push(`/task/${item.id}`)}
            onCancel={() => handleCancel(item.id, item.offer_count)}
            cancelling={cancelling}
          />
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <Text className="text-slate-500">Aún no has publicado ninguna tarea.</Text>
          </View>
        }
      />
    </View>
  );
}

function JobsList() {
  const { data, isPending, isError, refetch } = useMyOffers();
  const { mutateAsync: withdraw, isPending: withdrawing } = useWithdrawOffer();
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const handleWithdraw = async (offerId: string, taskId: string) => {
    setWithdrawError(null);
    try {
      await withdraw({ offerId, taskId });
    } catch (e) {
      setWithdrawError(e instanceof Error ? mapAuthError(e.message) : 'Error al retirar la oferta');
    }
  };

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (isError) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-slate-500 text-center mb-4">No pudimos cargar tus ofertas.</Text>
        <Pressable onPress={() => refetch()} className="bg-brand px-4 py-2 rounded-xl">
          <Text className="text-white font-bold">Reintentar</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View className="flex-1">
      {withdrawError ? (
        <Text className="text-xs text-red-500 text-center mt-2">{withdrawError}</Text>
      ) : null}
      <FlatList
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        data={data}
        keyExtractor={(item: MyOfferWithTask) => item.id}
        renderItem={({ item }) => (
          <MyOfferRow
            offer={item}
            onWithdraw={() => handleWithdraw(item.id, item.task_id)}
            disabled={withdrawing}
          />
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <Text className="text-slate-500">Aún no has hecho ninguna oferta.</Text>
          </View>
        }
      />
    </View>
  );
}
