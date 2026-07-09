import { Pressable, Text } from 'react-native';
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
}

export function PublishedTaskRow({ task, onPress }: PublishedTaskRowProps) {
  return (
    <Pressable
      testID="published-task-row"
      onPress={onPress}
      className="bg-white border border-slate-200 rounded-2xl p-4 mb-3"
    >
      <Text className="text-slate-900 font-bold text-sm">{task.title}</Text>
      <Text className="text-slate-500 text-xs mt-1">{statusLine(task)}</Text>
    </Pressable>
  );
}
