// features/auth/__tests__/PhoneForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PhoneForm } from '@/features/auth/PhoneForm';

describe('PhoneForm', () => {
  it('blocks submit and shows a validation error for an invalid phone', async () => {
    const onSubmit = jest.fn();
    await render(<PhoneForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '123');
    await fireEvent.press(screen.getByText('Enviar código'));
    await waitFor(() => expect(screen.getByText('Debe ser un celular de 10 dígitos')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a valid 10-digit phone number', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<PhoneForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '3001234567');
    await fireEvent.press(screen.getByText('Enviar código'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('3001234567'));
  });

  it('shows a mapped Spanish error when onSubmit throws an invalid_phone error', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('invalid_phone'));
    await render(<PhoneForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '3001234567');
    await fireEvent.press(screen.getByText('Enviar código'));
    await waitFor(() => expect(screen.getByText('Número de celular inválido.')).toBeTruthy());
  });
});
