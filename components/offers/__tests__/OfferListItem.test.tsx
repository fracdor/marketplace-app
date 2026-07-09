import { render, screen, fireEvent } from '@testing-library/react-native';
import { OfferListItem } from '@/components/offers/OfferListItem';
import type { OfferWithFreelancer } from '@/features/offers/types';

const offer: OfferWithFreelancer = {
  id: 'o1',
  task_id: 't1',
  freelancer_id: 'u2',
  price: 85000,
  message: 'Puedo empezar mañana',
  status: 'pending',
  created_at: new Date().toISOString(),
  freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
};

describe('OfferListItem', () => {
  it('renders the freelancer name, price, and message', async () => {
    await render(<OfferListItem offer={offer} onAccept={jest.fn()} />);
    expect(screen.getByText('Carlos Ruiz · $85.000')).toBeTruthy();
    expect(screen.getByText('Puedo empezar mañana')).toBeTruthy();
  });

  it('falls back to Anónimo when the freelancer has no name', async () => {
    const anon = { ...offer, freelancer: { full_name: null, avatar_url: null } };
    await render(<OfferListItem offer={anon} onAccept={jest.fn()} />);
    expect(screen.getByText('Anónimo · $85.000')).toBeTruthy();
  });

  it('calls onAccept when the Aceptar button is pressed', async () => {
    const onAccept = jest.fn();
    await render(<OfferListItem offer={offer} onAccept={onAccept} />);
    await fireEvent.press(screen.getByText('Aceptar'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('disables the Aceptar button when disabled is true', async () => {
    await render(<OfferListItem offer={offer} onAccept={jest.fn()} disabled />);
    expect(screen.getByTestId('accept-offer-button').props.accessibilityState?.disabled).toBe(true);
  });
});
