import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useOpenTasks, useTask } from '@/features/tasks/hooks';
import type { TaskWithRelations } from '@/features/tasks/types';

jest.mock('@/features/tasks/api', () => ({
  fetchOpenTasks: jest.fn(),
  fetchTaskById: jest.fn(),
}));

import { fetchOpenTasks, fetchTaskById } from '@/features/tasks/api';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
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
