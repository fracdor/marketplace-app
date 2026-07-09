// features/tasks/__tests__/hooks.test.tsx
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useOpenTasks, useTask, useCategories, useCreateTask, useMyTasks, useCompleteTask } from '@/features/tasks/hooks';
import type { CreateTaskInput, MyPublishedTask, TaskWithRelations } from '@/features/tasks/types';

jest.mock('@/features/tasks/api', () => ({
  fetchOpenTasks: jest.fn(),
  fetchTaskById: jest.fn(),
  fetchCategories: jest.fn(),
  createTask: jest.fn(),
  fetchMyTasks: jest.fn(),
  completeTask: jest.fn(),
}));

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

import { fetchOpenTasks, fetchTaskById, fetchCategories, createTask, fetchMyTasks, completeTask } from '@/features/tasks/api';
import { useAuth } from '@/features/auth/useAuth';

// RNTL 14: render is async; queries come off the global `screen`, not the
// render() return value (see LoginForm.test.tsx / ProfileForm.test.tsx for
// the established pattern in this codebase).
async function renderWithClient(ui: ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}

const sampleTask: TaskWithRelations = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga',
  description: 'desc',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  status: 'open',
  assigned_freelancer_id: null,
  created_at: '2026-07-04T10:00:00.000Z',
  updated_at: '2026-07-04T10:00:00.000Z',
  category: { name: 'Plomería', slug: 'plomeria' },
  client: { full_name: 'Ana Ruiz', avatar_url: null },
};

function OpenTasksProbe() {
  const { data, isPending } = useOpenTasks();
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.length ?? 0} tareas</Text>;
}

function TaskProbe({ id }: { id: string }) {
  const { data, isPending } = useTask(id);
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.title ?? 'not found'}</Text>;
}

function CategoriesProbe() {
  const { data, isPending } = useCategories();
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.length ?? 0} categorías</Text>;
}

const sampleInput: CreateTaskInput = {
  category_id: 3,
  title: 'Arreglar fuga',
  description: 'Hay una fuga debajo del lavaplatos que necesita reparación.',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
};

function CreateTaskProbe() {
  const mutation = useCreateTask();
  if (mutation.isSuccess) return <Text>created</Text>;
  return <Text onPress={() => mutation.mutate(sampleInput)}>submit</Text>;
}

const sampleMyTask: MyPublishedTask = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga',
  description: 'desc',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  status: 'open',
  assigned_freelancer_id: null,
  created_at: '2026-07-09T10:00:00.000Z',
  updated_at: '2026-07-09T10:00:00.000Z',
  offer_count: 2,
  assigned_freelancer: null,
};

function MyTasksProbe() {
  const { data, isPending } = useMyTasks();
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.length ?? 0} mis tareas</Text>;
}

function CompleteTaskProbe() {
  const mutation = useCompleteTask();
  if (mutation.isSuccess) return <Text>completed</Text>;
  return <Text onPress={() => mutation.mutate('t1')}>complete</Text>;
}

describe('useOpenTasks', () => {
  it('resolves with the tasks returned by fetchOpenTasks', async () => {
    (fetchOpenTasks as jest.Mock).mockResolvedValue([sampleTask]);
    await renderWithClient(<OpenTasksProbe />);
    await waitFor(() => expect(screen.getByText('1 tareas')).toBeTruthy());
  });
});

describe('useTask', () => {
  it('resolves with the task returned by fetchTaskById', async () => {
    (fetchTaskById as jest.Mock).mockResolvedValue(sampleTask);
    await renderWithClient(<TaskProbe id="t1" />);
    await waitFor(() => expect(screen.getByText('Arreglar fuga')).toBeTruthy());
  });
});

describe('useCategories', () => {
  it('resolves with the categories returned by fetchCategories', async () => {
    (fetchCategories as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Limpieza del hogar', slug: 'limpieza-hogar' },
      { id: 3, name: 'Plomería', slug: 'plomeria' },
    ]);
    await renderWithClient(<CategoriesProbe />);
    await waitFor(() => expect(screen.getByText('2 categorías')).toBeTruthy());
  });
});

describe('useCreateTask', () => {
  it('calls createTask with the current session user id and the input', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } });
    (createTask as jest.Mock).mockResolvedValue(undefined);
    await renderWithClient(<CreateTaskProbe />);
    fireEvent.press(screen.getByText('submit'));
    await waitFor(() => expect(screen.getByText('created')).toBeTruthy());
    expect(createTask).toHaveBeenCalledWith('u1', sampleInput);
  });

  it('invalidates the open-tasks list query on success', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } });
    (createTask as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    await renderWithClient(<CreateTaskProbe />, client);
    fireEvent.press(screen.getByText('submit'));
    await waitFor(() => expect(screen.getByText('created')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] });
  });
});

describe('useMyTasks', () => {
  it('resolves with the tasks returned by fetchMyTasks for the current user', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } });
    (fetchMyTasks as jest.Mock).mockResolvedValue([sampleMyTask]);
    await renderWithClient(<MyTasksProbe />);
    await waitFor(() => expect(screen.getByText('1 mis tareas')).toBeTruthy());
    expect(fetchMyTasks).toHaveBeenCalledWith('u1');
  });
});

describe('useCompleteTask', () => {
  it('calls completeTask with the task id', async () => {
    (completeTask as jest.Mock).mockResolvedValue(undefined);
    await renderWithClient(<CompleteTaskProbe />);
    fireEvent.press(screen.getByText('complete'));
    await waitFor(() => expect(screen.getByText('completed')).toBeTruthy());
    expect(completeTask).toHaveBeenCalledWith('t1');
  });

  it('invalidates the task detail and my-tasks list queries on success', async () => {
    (completeTask as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    await renderWithClient(<CompleteTaskProbe />, client);
    fireEvent.press(screen.getByText('complete'));
    await waitFor(() => expect(screen.getByText('completed')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'list', 'mine'] });
  });
});
