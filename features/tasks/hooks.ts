import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOpenTasks, fetchTaskById, fetchCategories, createTask, fetchMyTasks, completeTask } from '@/features/tasks/api';
import { useAuth } from '@/features/auth/useAuth';
import type { CreateTaskInput } from '@/features/tasks/types';

// Replaces the previous plain keys (['tasks','open'], ['tasks', id]) now that
// there's a real invalidation need (creating a task must refresh the open
// list). See the plan's design spec for why this wasn't introduced earlier.
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filter: string) => [...taskKeys.lists(), filter] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};

export function useOpenTasks() {
  return useQuery({
    queryKey: taskKeys.list('open'),
    queryFn: fetchOpenTasks,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => fetchTaskById(id),
  });
}

// Static catalog (seeded by migration, no runtime management UI) — safe to
// treat as never-stale, avoiding a refetch every time the post-task screen
// remounts.
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: Infinity,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => {
      if (!session) throw new Error('No hay sesión activa');
      return createTask(session.user.id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

export function useMyTasks() {
  const { session } = useAuth();
  return useQuery({
    queryKey: taskKeys.list('mine'),
    // Safe non-null assertion: only mounted inside (tabs)/* screens, which
    // never render before the session is resolved. See "Before you start".
    queryFn: () => fetchMyTasks(session!.user.id),
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => completeTask(taskId),
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.list('mine') });
    },
  });
}
