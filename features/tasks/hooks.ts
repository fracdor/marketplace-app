import { useQuery } from '@tanstack/react-query';
import { fetchOpenTasks, fetchTaskById } from '@/features/tasks/api';

export function useOpenTasks() {
  return useQuery({
    queryKey: ['tasks', 'open'],
    queryFn: fetchOpenTasks,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => fetchTaskById(id),
  });
}
