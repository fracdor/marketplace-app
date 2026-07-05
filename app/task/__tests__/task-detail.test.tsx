import { render, screen } from '@testing-library/react-native';
import TaskDetailScreen from '@/app/task/[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 't1' }),
  Stack: { Screen: () => null },
}));

jest.mock('@/features/tasks/hooks', () => ({
  useTask: jest.fn(),
}));

import { useTask } from '@/features/tasks/hooks';

const task = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga en la cocina',
  description: 'Hay una fuga debajo del lavaplatos.',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  status: 'open' as const,
  assigned_freelancer_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  category: { name: 'Plomería', slug: 'plomeria' },
  client: { full_name: 'Ana Ruiz', avatar_url: null },
};

describe('TaskDetailScreen', () => {
  it('renders the task fields and a disabled Ofertar button', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    await render(<TaskDetailScreen />);
    expect(screen.getByText('Arreglar fuga en la cocina')).toBeTruthy();
    expect(screen.getByText('Plomería')).toBeTruthy();
    expect(screen.getByText('$80.000')).toBeTruthy();
    expect(screen.getByText('Hay una fuga debajo del lavaplatos.')).toBeTruthy();
    expect(screen.getByText('Ana Ruiz')).toBeTruthy();
    expect(screen.getByText('Ofertar (próximamente)')).toBeTruthy();
  });

  it('shows a loading state while pending, not the task content', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: undefined, isPending: true, isError: false });
    await render(<TaskDetailScreen />);
    expect(screen.queryByText('Arreglar fuga en la cocina')).toBeNull();
  });
});
