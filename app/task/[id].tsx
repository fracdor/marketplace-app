import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTask } from '@/features/tasks/hooks';
import { formatBudget, formatRelativeTime } from '@/features/tasks/format';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: task, isPending, isError } = useTask(id);

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
          <Text className="text-slate-500 text-center">No pudimos cargar esta tarea.</Text>
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
            <View className="bg-slate-300 rounded-xl h-11 items-center justify-center">
              <Text className="text-slate-500 font-bold text-sm">Ofertar (próximamente)</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
