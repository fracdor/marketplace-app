import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import MyTasks from '@/app/(tabs)/my-tasks';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/features/tasks/hooks', () => ({
  useMyTasks: jest.fn(),
  useCancelTask: jest.fn(),
}));

jest.mock('@/features/offers/hooks', () => ({
  useMyOffers: jest.fn(),
  useWithdrawOffer: jest.fn(),
}));

import { useMyTasks, useCancelTask } from '@/features/tasks/hooks';
import { useMyOffers, useWithdrawOffer } from '@/features/offers/hooks';

const publishedTask = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga',
  description: 'desc',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  status: 'open' as const,
  assigned_freelancer_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  offer_count: 2,
  assigned_freelancer: null,
};

const myOffer = {
  id: 'o1',
  task_id: 't2',
  freelancer_id: 'u1',
  price: 90000,
  message: null,
  status: 'pending' as const,
  created_at: new Date().toISOString(),
  task: { id: 't2', title: 'Pintar sala', city: 'Bogotá', status: 'open' as const },
};

function mockDefaults() {
  (useMyTasks as jest.Mock).mockReturnValue({ data: [publishedTask], isPending: false, isError: false, refetch: jest.fn() });
  (useMyOffers as jest.Mock).mockReturnValue({ data: [myOffer], isPending: false, isError: false, refetch: jest.fn() });
  (useWithdrawOffer as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
}

describe('MyTasks', () => {
  beforeEach(() => {
    mockDefaults();
  });

  it('shows the Publicadas list by default', async () => {
    await render(<MyTasks />);
    expect(screen.getByText('Arreglar fuga')).toBeTruthy();
    expect(screen.queryByText('Pintar sala')).toBeNull();
  });

  it('switches to the Trabajos list when that sub-tab is pressed', async () => {
    await render(<MyTasks />);
    await fireEvent.press(screen.getByText('Trabajos'));
    await waitFor(() => expect(screen.getByText('Pintar sala')).toBeTruthy());
    expect(screen.queryByText('Arreglar fuga')).toBeNull();
  });

  it('shows the empty state for Publicadas when there are no tasks', async () => {
    (useMyTasks as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false, refetch: jest.fn() });
    await render(<MyTasks />);
    expect(screen.getByText('Aún no has publicado ninguna tarea.')).toBeTruthy();
  });

  it('calls withdraw when Retirar oferta is pressed in Trabajos', async () => {
    const withdraw = jest.fn();
    (useWithdrawOffer as jest.Mock).mockReturnValue({ mutateAsync: withdraw, isPending: false });
    await render(<MyTasks />);
    await fireEvent.press(screen.getByText('Trabajos'));
    await waitFor(() => expect(screen.getByText('Retirar oferta')).toBeTruthy());
    await fireEvent.press(screen.getByText('Retirar oferta'));
    expect(withdraw).toHaveBeenCalledWith({ offerId: 'o1', taskId: 't2' });
  });

  it('shows an error message when withdrawing an offer fails', async () => {
    const withdraw = jest.fn().mockRejectedValue(new Error('network error'));
    (useWithdrawOffer as jest.Mock).mockReturnValue({ mutateAsync: withdraw, isPending: false });
    await render(<MyTasks />);
    await fireEvent.press(screen.getByText('Trabajos'));
    await waitFor(() => expect(screen.getByText('Retirar oferta')).toBeTruthy());
    await fireEvent.press(screen.getByText('Retirar oferta'));
    await waitFor(() => expect(screen.getByText('Algo salió mal. Intenta de nuevo.')).toBeTruthy());
  });

  it('asks for confirmation before cancelling a task from Publicadas, and calls cancelTask when confirmed', async () => {
    const cancelTask = jest.fn().mockResolvedValue(undefined);
    (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: cancelTask, isPending: false });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
      expect(message).toBe('¿Cancelar esta tarea? Se cancelarán también las 2 ofertas recibidas. No podrás reabrirla.');
      const confirmButton = buttons?.find((b) => b.text === 'Sí, cancelar');
      confirmButton?.onPress?.();
    });

    await render(<MyTasks />);
    await fireEvent.press(screen.getByText('Cancelar'));

    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => expect(cancelTask).toHaveBeenCalledWith('t1'));
  });

  it('shows an error message when cancelling a task fails', async () => {
    const cancelTask = jest.fn().mockRejectedValue(new Error('network error'));
    (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: cancelTask, isPending: false });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirmButton = buttons?.find((b) => b.text === 'Sí, cancelar');
      confirmButton?.onPress?.();
    });

    await render(<MyTasks />);
    await fireEvent.press(screen.getByText('Cancelar'));

    await waitFor(() => expect(screen.getByText('Algo salió mal. Intenta de nuevo.')).toBeTruthy());
  });
});
