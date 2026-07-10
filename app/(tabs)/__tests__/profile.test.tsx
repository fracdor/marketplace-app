// app/(tabs)/__tests__/profile.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileTab from '@/app/(tabs)/profile';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/features/auth/actions', () => ({
  saveProfile: jest.fn(),
  signOut: jest.fn(),
}));

import { useAuth } from '@/features/auth/useAuth';
import { saveProfile, signOut } from '@/features/auth/actions';

const profile = {
  id: 'u1',
  full_name: 'Ana Ruiz',
  city: 'Bogotá',
  phone: '3001234567',
  phone_verified: true,
  avatar_url: null,
};

let refreshProfile: jest.Mock;

function mockDefaults() {
  refreshProfile = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({
    session: { user: { id: 'u1' } },
    profile,
    refreshProfile,
  });
}

describe('ProfileTab', () => {
  beforeEach(() => {
    mockDefaults();
    (saveProfile as jest.Mock).mockResolvedValue(undefined);
    (signOut as jest.Mock).mockResolvedValue(undefined);
  });

  it('shows the current profile in view mode', async () => {
    await render(<ProfileTab />);
    expect(screen.getByText('Ana Ruiz')).toBeTruthy();
    expect(screen.getByText('Bogotá')).toBeTruthy();
    expect(screen.getByText('★ nuevo')).toBeTruthy();
    expect(screen.getByText('+57 3001234567')).toBeTruthy();
    expect(screen.getByText('✓ Verificado')).toBeTruthy();
    expect(screen.getByText('Editar perfil')).toBeTruthy();
  });

  it('shows the prefilled form when Editar perfil is pressed', async () => {
    await render(<ProfileTab />);
    await fireEvent.press(screen.getByText('Editar perfil'));
    expect(screen.getByDisplayValue('Ana Ruiz')).toBeTruthy();
    expect(screen.getByDisplayValue('Bogotá')).toBeTruthy();
    expect(screen.getByText('Guardar')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
  });

  it('returns to view mode without saving when Cancelar is pressed', async () => {
    await render(<ProfileTab />);
    await fireEvent.press(screen.getByText('Editar perfil'));
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(screen.getByText('Editar perfil')).toBeTruthy();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('saves changes and returns to view mode when Guardar is pressed', async () => {
    await render(<ProfileTab />);
    await fireEvent.press(screen.getByText('Editar perfil'));
    await fireEvent.changeText(screen.getByTestId('name-input'), 'Ana María Ruiz');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() =>
      expect(saveProfile).toHaveBeenCalledWith('u1', { full_name: 'Ana María Ruiz', city: 'Bogotá' }),
    );
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Editar perfil')).toBeTruthy());
  });

  it('signs out when Cerrar sesión is pressed', async () => {
    await render(<ProfileTab />);
    await fireEvent.press(screen.getByText('Cerrar sesión'));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });
});
