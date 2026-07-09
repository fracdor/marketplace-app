import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { OfferForm } from '@/components/offers/OfferForm';

describe('OfferForm', () => {
  it('blocks submit and shows an error when price is empty', async () => {
    const onSubmit = jest.fn();
    await render(<OfferForm taskId="t1" onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByText('Enviar oferta'));
    await waitFor(() =>
      expect(screen.getByText('El precio debe ser un número entero mayor a cero')).toBeTruthy(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the converted payload with a valid price and no message', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<OfferForm taskId="t1" onSubmit={onSubmit} />);
    // RNTL 14: fireEvent.changeText is async too — must be awaited like fireEvent.press,
    // otherwise its dangling internal act() scope corrupts the next test's render.
    await fireEvent.changeText(screen.getByTestId('price-input'), '85000');
    await fireEvent.press(screen.getByText('Enviar oferta'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ task_id: 't1', price: 85000, message: null }),
    );
  });

  it('submits the message when provided', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<OfferForm taskId="t1" onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('price-input'), '85000');
    await fireEvent.changeText(screen.getByTestId('message-input'), 'Puedo empezar mañana');
    await fireEvent.press(screen.getByText('Enviar oferta'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ task_id: 't1', price: 85000, message: 'Puedo empezar mañana' }),
    );
  });
});
