import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileForm } from '@/features/auth/ProfileForm';

describe('ProfileForm', () => {
  it('blocks submit and shows errors when empty', async () => {
    const onSubmit = jest.fn();
    await render(<ProfileForm onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(screen.getByText('El nombre es obligatorio')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits name and city', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<ProfileForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('name-input'), 'Ana Ruiz');
    await fireEvent.changeText(screen.getByTestId('city-input'), 'Bogotá');
    await fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ full_name: 'Ana Ruiz', city: 'Bogotá' }));
  });

  it('prefills the fields when initialValues is provided', async () => {
    const onSubmit = jest.fn();
    await render(
      <ProfileForm onSubmit={onSubmit} initialValues={{ full_name: 'Ana Ruiz', city: 'Bogotá' }} />,
    );
    expect(screen.getByDisplayValue('Ana Ruiz')).toBeTruthy();
    expect(screen.getByDisplayValue('Bogotá')).toBeTruthy();
  });

  it('uses a custom submit label when provided', async () => {
    const onSubmit = jest.fn();
    await render(<ProfileForm onSubmit={onSubmit} submitLabel="Guardar" />);
    expect(screen.getByText('Guardar')).toBeTruthy();
    expect(screen.queryByText('Continuar')).toBeNull();
  });
});
