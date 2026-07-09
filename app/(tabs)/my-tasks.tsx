import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PublishedTaskRow } from '@/components/tasks/PublishedTaskRow';
import { MyOfferRow } from '@/components/offers/MyOfferRow';
import { useMyTasks } from '@/features/tasks/hooks';
import { useMyOffers, useWithdrawOffer } from '@/features/offers/hooks';
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
          onPress={() => setSubTab('published')}
          className={`flex-1 items-center py-3 border-b-2 ${subTab === 'published' ? 'border-brand' : 'border-transparent'}`}
        >
          <Text className={subTab === 'published' ? 'text-brand font-bold' : 'text-slate-500'}>Publicadas</Text>
        </Pressable>
        <Pressable
          testID="sub-tab-jobs"
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
    <FlatList
      contentContainerStyle={{ padding: 16 }}
      data={data}
      keyExtractor={(item: MyPublishedTask) => item.id}
      renderItem={({ item }) => (
        <PublishedTaskRow task={item} onPress={() => router.push(`/task/${item.id}`)} />
      )}
      ListEmptyComponent={
        <View className="items-center justify-center py-20">
          <Text className="text-slate-500">Aún no has publicado ninguna tarea.</Text>
        </View>
      }
    />
  );
}

function JobsList() {
  const { data, isPending, isError, refetch } = useMyOffers();
  const { mutateAsync: withdraw } = useWithdrawOffer();

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
    <FlatList
      contentContainerStyle={{ padding: 16 }}
      data={data}
      keyExtractor={(item: MyOfferWithTask) => item.id}
      renderItem={({ item }) => (
        <MyOfferRow offer={item} onWithdraw={() => withdraw({ offerId: item.id, taskId: item.task_id })} />
      )}
      ListEmptyComponent={
        <View className="items-center justify-center py-20">
          <Text className="text-slate-500">Aún no has hecho ninguna oferta.</Text>
        </View>
      }
    />
  );
}
