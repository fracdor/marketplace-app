import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginForm } from '@/features/auth/LoginForm';

describe('LoginForm', () => {
  it('shows a validation error and does not submit on invalid input', async () => {
    const onSubmit = jest.fn();
    await render(<LoginForm onSubmit={onSubmit} />); // RNTL 14: render is async
    fireEvent.press(screen.getByText('Ingresar'));
    await waitFor(() => expect(screen.getByText('Correo inválido')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid credentials', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<LoginForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByTestId('email-input'), 'a@b.co');
    fireEvent.changeText(screen.getByTestId('password-input'), 'secret12');
    fireEvent.press(screen.getByText('Ingresar'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a@b.co', 'secret12'));
  });
});
