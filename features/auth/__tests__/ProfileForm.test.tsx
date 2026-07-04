import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileForm } from '@/features/auth/ProfileForm';

describe('ProfileForm', () => {
  it('blocks submit and shows errors when empty', async () => {
    const onSubmit = jest.fn();
    await render(<ProfileForm onSubmit={onSubmit} />); // RNTL 14: render is async
    fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(screen.getByText('El nombre es obligatorio')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits name and city', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<ProfileForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByTestId('name-input'), 'Ana Ruiz');
    fireEvent.changeText(screen.getByTestId('city-input'), 'Bogotá');
    fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ full_name: 'Ana Ruiz', city: 'Bogotá' }));
  });
});
