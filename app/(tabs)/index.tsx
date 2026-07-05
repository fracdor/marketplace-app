import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TaskCard } from '@/components/tasks/TaskCard';
import { useOpenTasks } from '@/features/tasks/hooks';
import type { TaskWithRelations } from '@/features/tasks/types';

export default function Feed() {
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useOpenTasks();

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-slate-500 text-center">
          No pudimos cargar las tareas. Desliza hacia abajo para reintentar.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-white"
      contentContainerStyle={{ padding: 16 }}
      data={data}
      keyExtractor={(item: TaskWithRelations) => item.id}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      renderItem={({ item }) => (
        <TaskCard task={item} onPress={() => router.push(`/task/${item.id}`)} />
      )}
      ListEmptyComponent={
        <View className="items-center justify-center py-20">
          <Text className="text-slate-500">No hay tareas abiertas por ahora.</Text>
        </View>
      }
    />
  );
}
