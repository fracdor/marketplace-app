import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import TaskDetailScreen from '@/app/task/[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 't1' }),
  useRouter: () => ({ push: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock('@/features/tasks/hooks', () => ({
  useTask: jest.fn(),
  useCompleteTask: jest.fn(),
  useCancelTask: jest.fn(),
}));

jest.mock('@/features/offers/hooks', () => ({
  useOffersForTask: jest.fn(),
  useAcceptOffer: jest.fn(),
  useWithdrawOffer: jest.fn(),
}));

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

import { useTask, useCompleteTask, useCancelTask } from '@/features/tasks/hooks';
import { useOffersForTask, useAcceptOffer, useWithdrawOffer } from '@/features/offers/hooks';
import { useAuth } from '@/features/auth/useAuth';

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

function mockActionDefaults() {
  (useCompleteTask as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useAcceptOffer as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useWithdrawOffer as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
}

describe('TaskDetailScreen', () => {
  beforeEach(() => {
    mockActionDefaults();
  });

  it('renders the task fields and an Ofertar button for a freelancer browsing an open task', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    await render(<TaskDetailScreen />);
    expect(screen.getByText('Arreglar fuga en la cocina')).toBeTruthy();
    expect(screen.getByText('Plomería')).toBeTruthy();
    expect(screen.getByText('$80.000')).toBeTruthy();
    expect(screen.getByText('Hay una fuga debajo del lavaplatos.')).toBeTruthy();
    expect(screen.getByText('Ana Ruiz')).toBeTruthy();
    expect(screen.getByText('Ofertar')).toBeTruthy();
  });

  it('shows a loading state while pending, not the task content', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: undefined, isPending: true, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: undefined, isPending: false, isError: false });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    await render(<TaskDetailScreen />);
    expect(screen.queryByText('Arreglar fuga en la cocina')).toBeNull();
  });

  it('shows a loading state while the task loaded but offers are still pending', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: undefined, isPending: true, isError: false });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    await render(<TaskDetailScreen />);
    expect(screen.queryByText('Arreglar fuga en la cocina')).toBeNull();
    expect(screen.queryByText('Ofertar')).toBeNull();
  });

  it('shows a retry button on error, and pressing it calls refetch for both queries', async () => {
    const refetchTask = jest.fn();
    const refetchOffers = jest.fn();
    (useTask as jest.Mock).mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: refetchTask });
    (useOffersForTask as jest.Mock).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      refetch: refetchOffers,
    });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    await render(<TaskDetailScreen />);
    expect(screen.getByText('No pudimos cargar esta tarea.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(refetchTask).toHaveBeenCalledTimes(1);
    expect(refetchOffers).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before accepting an offer, and calls acceptOffer when confirmed', async () => {
    const receivedOffer = {
      id: 'o1',
      task_id: 't1',
      freelancer_id: 'u2',
      price: 85000,
      message: 'Puedo empezar mañana',
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
    };
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: [receivedOffer], isPending: false, isError: false });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } }); // owner
    const acceptOffer = jest.fn().mockResolvedValue(undefined);
    (useAcceptOffer as jest.Mock).mockReturnValue({ mutateAsync: acceptOffer, isPending: false });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirmButton = buttons?.find((b) => b.text === 'Aceptar');
      confirmButton?.onPress?.();
    });

    await render(<TaskDetailScreen />);
    await fireEvent.press(screen.getByText('Aceptar'));

    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => expect(acceptOffer).toHaveBeenCalledWith({ offerId: 'o1', taskId: 't1' }));
  });

  it('surfaces a mapped error when withdrawing an offer fails', async () => {
    const myOffer = {
      id: 'o2',
      task_id: 't1',
      freelancer_id: 'u2',
      price: 90000,
      message: null,
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
    };
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: [myOffer], isPending: false, isError: false });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } }); // freelancer with own pending offer
    const withdrawOffer = jest.fn().mockRejectedValue(new Error('some backend error'));
    (useWithdrawOffer as jest.Mock).mockReturnValue({ mutateAsync: withdrawOffer, isPending: false });

    await render(<TaskDetailScreen />);
    await fireEvent.press(screen.getByText('Retirar oferta'));

    await waitFor(() => expect(withdrawOffer).toHaveBeenCalledWith({ offerId: 'o2', taskId: 't1' }));
    expect(await screen.findByText('Algo salió mal. Intenta de nuevo.')).toBeTruthy();
  });

  it('surfaces a mapped error when completing a task fails', async () => {
    const assignedTask = { ...task, status: 'assigned' as const, assigned_freelancer_id: 'u2' };
    (useTask as jest.Mock).mockReturnValue({ data: assignedTask, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } }); // owner
    const completeTask = jest.fn().mockRejectedValue(new Error('some backend error'));
    (useCompleteTask as jest.Mock).mockReturnValue({ mutateAsync: completeTask, isPending: false });

    await render(<TaskDetailScreen />);
    await fireEvent.press(screen.getByText('Marcar como completada'));

    await waitFor(() => expect(completeTask).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('Algo salió mal. Intenta de nuevo.')).toBeTruthy();
  });

  it('asks for confirmation before cancelling a task with no offers, and calls cancelTask when confirmed', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } }); // owner
    const cancelTask = jest.fn().mockResolvedValue(undefined);
    (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: cancelTask, isPending: false });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
      expect(message).toBe('¿Cancelar esta tarea? No podrás reabrirla.');
      const confirmButton = buttons?.find((b) => b.text === 'Sí, cancelar');
      confirmButton?.onPress?.();
    });

    await render(<TaskDetailScreen />);
    await fireEvent.press(screen.getByText('Cancelar tarea'));

    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => expect(cancelTask).toHaveBeenCalledWith('t1'));
  });

  it('includes the offer count in the cancel confirmation message when there is a pending offer', async () => {
    const receivedOffer = {
      id: 'o1',
      task_id: 't1',
      freelancer_id: 'u2',
      price: 85000,
      message: null,
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
    };
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: [receivedOffer], isPending: false, isError: false });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } }); // owner
    (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, message) => {
      expect(message).toBe('¿Cancelar esta tarea? Se cancelará también 1 oferta recibida. No podrás reabrirla.');
    });

    await render(<TaskDetailScreen />);
    await fireEvent.press(screen.getByText('Cancelar tarea'));

    expect(alertSpy).toHaveBeenCalled();
  });
});
