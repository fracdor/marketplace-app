// components/tasks/__tests__/PublishedTaskRow.test.tsx
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

const noop = { onPress: jest.fn(), onCancel: jest.fn() };

describe('PublishedTaskRow', () => {
  it('shows the offer count and a Cancelar button for an open task', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 3,
      assigned_freelancer: null,
    };
    await render(<PublishedTaskRow task={task} cancelling={false} {...noop} />);
    expect(screen.getByText('Arreglar fuga')).toBeTruthy();
    expect(screen.getByText('Abierta · 3 ofertas recibidas')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
  });

  it('uses singular wording for exactly one offer', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 1,
      assigned_freelancer: null,
    };
    await render(<PublishedTaskRow task={task} cancelling={false} {...noop} />);
    expect(screen.getByText('Abierta · 1 oferta recibida')).toBeTruthy();
  });

  it('shows the assigned freelancer for an assigned task, and hides Cancelar', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'assigned',
      assigned_freelancer_id: 'u2',
      offer_count: 0,
      assigned_freelancer: { full_name: 'Carlos Ruiz' },
    };
    await render(<PublishedTaskRow task={task} cancelling={false} {...noop} />);
    expect(screen.getByText('Asignada a Carlos Ruiz')).toBeTruthy();
    expect(screen.queryByText('Cancelar')).toBeNull();
  });

  it('shows the freelancer name for a completed task, and hides Cancelar', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'completed',
      assigned_freelancer_id: 'u2',
      offer_count: 0,
      assigned_freelancer: { full_name: 'Carlos Ruiz' },
    };
    await render(<PublishedTaskRow task={task} cancelling={false} {...noop} />);
    expect(screen.getByText('Completada · Carlos Ruiz')).toBeTruthy();
    expect(screen.queryByText('Cancelar')).toBeNull();
  });

  it('calls onPress when the row content is tapped', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 0,
      assigned_freelancer: null,
    };
    const onPress = jest.fn();
    await render(<PublishedTaskRow task={task} cancelling={false} onPress={onPress} onCancel={jest.fn()} />);
    await fireEvent.press(screen.getByText('Arreglar fuga'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel (not onPress) when Cancelar is tapped', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 0,
      assigned_freelancer: null,
    };
    const onPress = jest.fn();
    const onCancel = jest.fn();
    await render(<PublishedTaskRow task={task} cancelling={false} onPress={onPress} onCancel={onCancel} />);
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('disables the Cancelar button when cancelling is true', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 0,
      assigned_freelancer: null,
    };
    await render(<PublishedTaskRow task={task} cancelling {...noop} />);
    expect(screen.getByTestId('cancel-task-row-button').props.accessibilityState?.disabled).toBe(true);
  });
});
