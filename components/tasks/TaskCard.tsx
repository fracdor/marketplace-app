import { Pressable, View, Text } from 'react-native';
import { formatBudget, formatRelativeTime } from '@/features/tasks/format';
import type { TaskWithRelations } from '@/features/tasks/types';

interface TaskCardProps {
  task: TaskWithRelations;
  onPress: () => void;
}

function firstNameAndInitial(fullName: string | null): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return 'Anónimo'; // covers null, '', and whitespace-only names
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  return (
    <Pressable
      testID="task-card"
      onPress={onPress}
      className="bg-white border border-slate-200 rounded-2xl p-4 mb-3"
    >
      <View className="flex-row justify-between items-start">
        <View className="bg-brand/10 px-2 py-1 rounded-full">
          <Text className="text-brand text-xs font-bold">{task.category.name}</Text>
        </View>
        <Text className="text-slate-400 text-xs">★ nuevo</Text>
      </View>
      <Text className="text-slate-900 text-base font-bold mt-2">{task.title}</Text>
      <Text className="text-slate-500 text-xs mt-1">
        {task.city} · {formatRelativeTime(task.created_at)}
      </Text>
      <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-slate-100">
        <Text className="text-brand text-sm font-bold">{formatBudget(task.budget_reference)}</Text>
        <Text className="text-slate-400 text-xs">{firstNameAndInitial(task.client.full_name)}</Text>
      </View>
    </Pressable>
  );
}
