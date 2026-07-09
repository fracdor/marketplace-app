import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { PostTaskForm } from '@/components/tasks/PostTaskForm';
import { useCreateTask } from '@/features/tasks/hooks';
import type { CreateTaskInput } from '@/features/tasks/types';

export default function PostTask() {
  const router = useRouter();
  const { mutateAsync } = useCreateTask();

  const onSubmit = async (input: CreateTaskInput) => {
    await mutateAsync(input);
    router.replace('/(tabs)');
  };

  return (
    <View className="flex-1 bg-white px-5 pt-4">
      <Text className="text-xl font-extrabold text-slate-900 mb-4">Publicar tarea</Text>
      <PostTaskForm onSubmit={onSubmit} />
    </View>
  );
}
