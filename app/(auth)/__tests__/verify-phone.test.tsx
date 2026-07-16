import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import VerifyPhoneScreen from '@/app/(auth)/verify-phone';
import { useAuth } from '@/features/auth/useAuth';
import { sendPhoneCode, verifyPhoneCode } from '@/features/auth/actions';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/features/auth/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('@/features/auth/actions', () => ({
  sendPhoneCode: jest.fn(),
  verifyPhoneCode: jest.fn(),
}));

describe('VerifyPhoneScreen', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({
      session: { user: { id: 'u1' } },
      refreshProfile: jest.fn().mockResolvedValue(undefined),
    });
    (sendPhoneCode as jest.Mock).mockResolvedValue({ sent: true });
  });

  it('does not show the dev code hint in the code step', async () => {
    await render(<VerifyPhoneScreen />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '3001234567');
    await fireEvent.press(screen.getByText('Enviar código'));
    await waitFor(() => expect(screen.getByTestId('code-input')).toBeTruthy());
    expect(screen.queryByText('Código (dev: 123456)')).toBeNull();
    expect(screen.getByText('Código')).toBeTruthy();
  });

  it('shows a mapped Spanish error when verification fails', async () => {
    (verifyPhoneCode as jest.Mock).mockRejectedValue(new Error('invalid_code'));
    await render(<VerifyPhoneScreen />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '3001234567');
    await fireEvent.press(screen.getByText('Enviar código'));
    await waitFor(() => expect(screen.getByTestId('code-input')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('code-input'), '000000');
    await fireEvent.press(screen.getByText('Verificar'));
    await waitFor(() => expect(screen.getByText('Código incorrecto.')).toBeTruthy());
  });
});
