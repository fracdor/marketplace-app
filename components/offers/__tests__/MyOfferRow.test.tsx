import { render, screen, fireEvent } from '@testing-library/react-native';
import { MyOfferRow } from '@/components/offers/MyOfferRow';
import type { MyOfferWithTask } from '@/features/offers/types';

const baseOffer: Omit<MyOfferWithTask, 'status' | 'task'> = {
  id: 'o1',
  task_id: 't1',
  freelancer_id: 'u2',
  price: 85000,
  message: null,
  created_at: new Date().toISOString(),
};

describe('MyOfferRow', () => {
  it('shows the task title, price, and Pendiente status with a Retirar oferta button', async () => {
    const offer: MyOfferWithTask = {
      ...baseOffer,
      status: 'pending',
      task: { id: 't1', title: 'Pintar sala', city: 'Bogotá', status: 'open' },
    };
    await render(<MyOfferRow offer={offer} onWithdraw={jest.fn()} />);
    expect(screen.getByText('Pintar sala')).toBeTruthy();
    expect(screen.getByText('$85.000 · Pendiente')).toBeTruthy();
    expect(screen.getByText('Retirar oferta')).toBeTruthy();
  });

  it('hides the Retirar oferta button once the offer is accepted', async () => {
    const offer: MyOfferWithTask = {
      ...baseOffer,
      status: 'accepted',
      task: { id: 't1', title: 'Pintar sala', city: 'Bogotá', status: 'assigned' },
    };
    await render(<MyOfferRow offer={offer} onWithdraw={jest.fn()} />);
    expect(screen.getByText('$85.000 · Aceptada')).toBeTruthy();
    expect(screen.queryByText('Retirar oferta')).toBeNull();
  });

  it('falls back to a placeholder when the task is no longer visible', async () => {
    const offer: MyOfferWithTask = { ...baseOffer, status: 'rejected', task: null };
    await render(<MyOfferRow offer={offer} onWithdraw={jest.fn()} />);
    expect(screen.getByText('Tarea ya no disponible')).toBeTruthy();
  });

  it('calls onWithdraw when the Retirar oferta button is pressed', async () => {
    const offer: MyOfferWithTask = {
      ...baseOffer,
      status: 'pending',
      task: { id: 't1', title: 'Pintar sala', city: 'Bogotá', status: 'open' },
    };
    const onWithdraw = jest.fn();
    await render(<MyOfferRow offer={offer} onWithdraw={onWithdraw} />);
    await fireEvent.press(screen.getByText('Retirar oferta'));
    expect(onWithdraw).toHaveBeenCalledTimes(1);
  });

  it('disables the Retirar oferta button when disabled is true', async () => {
    const offer: MyOfferWithTask = {
      ...baseOffer,
      status: 'pending',
      task: { id: 't1', title: 'Pintar sala', city: 'Bogotá', status: 'open' },
    };
    await render(<MyOfferRow offer={offer} onWithdraw={jest.fn()} disabled />);
    expect(screen.getByTestId('withdraw-offer-button').props.accessibilityState?.disabled).toBe(true);
  });

  it("shows Tarea cancelada and hides the withdraw button when a pending offer's task was cancelled", async () => {
    const offer: MyOfferWithTask = {
      ...baseOffer,
      status: 'pending',
      task: { id: 't1', title: 'Pintar sala', city: 'Bogotá', status: 'cancelled' },
    };
    await render(<MyOfferRow offer={offer} onWithdraw={jest.fn()} />);
    expect(screen.getByText('$85.000 · Tarea cancelada')).toBeTruthy();
    expect(screen.queryByText('Retirar oferta')).toBeNull();
  });
});
