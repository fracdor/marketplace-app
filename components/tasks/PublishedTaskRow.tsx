// components/tasks/PublishedTaskRow.tsx
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { MyPublishedTask } from '@/features/tasks/types';

function statusLine(task: MyPublishedTask): string {
  switch (task.status) {
    case 'open':
      return task.offer_count === 1
        ? 'Abierta · 1 oferta recibida'
        : `Abierta · ${task.offer_count} ofertas recibidas`;
    case 'assigned':
      return task.assigned_freelancer?.full_name
        ? `Asignada a ${task.assigned_freelancer.full_name}`
        : 'Asignada';
    case 'completed':
      return task.assigned_freelancer?.full_name
        ? `Completada · ${task.assigned_freelancer.full_name}`
        : 'Completada';
    case 'cancelled':
      return 'Cancelada';
  }
}

interface PublishedTaskRowProps {
  task: MyPublishedTask;
  onPress: () => void;
  onCancel: () => void;
  cancelling: boolean;
}

export function PublishedTaskRow({ task, onPress, onCancel, cancelling }: PublishedTaskRowProps) {
  return (
    <View testID="published-task-row" className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
      <Pressable testID="published-task-row-content" accessibilityRole="button" onPress={onPress}>
        <Text className="text-slate-900 font-bold text-sm">{task.title}</Text>
        <Text className="text-slate-500 text-xs mt-1">{statusLine(task)}</Text>
      </Pressable>
      {task.status === 'open' ? (
        <Pressable
          testID="cancel-task-row-button"
          accessibilityRole="button"
          onPress={onCancel}
          disabled={cancelling}
          className="mt-3 bg-red-500 px-3 py-2 rounded-xl self-start"
        >
          {cancelling ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-xs">Cancelar</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
