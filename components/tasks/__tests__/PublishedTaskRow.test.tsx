import { render, screen, fireEvent } from '@testing-library/react-native';
import { PublishedTaskRow } from '@/components/tasks/PublishedTaskRow';
import type { MyPublishedTask } from '@/features/tasks/types';

const baseTask: Omit<MyPublishedTask, 'status' | 'assigned_freelancer_id' | 'offer_count' | 'assigned_freelancer'> = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga',
  description: 'desc',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('PublishedTaskRow', () => {
  it('shows the offer count for an open task', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 3,
      assigned_freelancer: null,
    };
    await render(<PublishedTaskRow task={task} onPress={jest.fn()} />);
    expect(screen.getByText('Arreglar fuga')).toBeTruthy();
    expect(screen.getByText('Abierta · 3 ofertas recibidas')).toBeTruthy();
  });

  it('uses singular wording for exactly one offer', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 1,
      assigned_freelancer: null,
    };
    await render(<PublishedTaskRow task={task} onPress={jest.fn()} />);
    expect(screen.getByText('Abierta · 1 oferta recibida')).toBeTruthy();
  });

  it('shows the assigned freelancer for an assigned task', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'assigned',
      assigned_freelancer_id: 'u2',
      offer_count: 0,
      assigned_freelancer: { full_name: 'Carlos Ruiz' },
    };
    await render(<PublishedTaskRow task={task} onPress={jest.fn()} />);
    expect(screen.getByText('Asignada a Carlos Ruiz')).toBeTruthy();
  });

  it('shows the freelancer name for a completed task', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'completed',
      assigned_freelancer_id: 'u2',
      offer_count: 0,
      assigned_freelancer: { full_name: 'Carlos Ruiz' },
    };
    await render(<PublishedTaskRow task={task} onPress={jest.fn()} />);
    expect(screen.getByText('Completada · Carlos Ruiz')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 0,
      assigned_freelancer: null,
    };
    const onPress = jest.fn();
    await render(<PublishedTaskRow task={task} onPress={onPress} />);
    await fireEvent.press(screen.getByText('Arreglar fuga'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
