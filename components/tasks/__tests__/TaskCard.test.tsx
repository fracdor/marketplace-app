import { render, screen, fireEvent } from '@testing-library/react-native';
import { TaskCard } from '@/components/tasks/TaskCard';
import type { TaskWithRelations } from '@/features/tasks/types';

const task: TaskWithRelations = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga en la cocina',
  description: 'desc',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  status: 'open',
  assigned_freelancer_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  category: { name: 'Plomería', slug: 'plomeria' },
  client: { full_name: 'Ana Ruiz', avatar_url: null },
};

describe('TaskCard', () => {
  it('renders title, category, city, and formatted budget', async () => {
    await render(<TaskCard task={task} onPress={() => {}} />);
    expect(screen.getByText('Arreglar fuga en la cocina')).toBeTruthy();
    expect(screen.getByText('Plomería')).toBeTruthy();
    expect(screen.getByText(/Bogotá/)).toBeTruthy();
    expect(screen.getByText('$80.000')).toBeTruthy();
  });

  it('fires onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<TaskCard task={task} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('task-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
