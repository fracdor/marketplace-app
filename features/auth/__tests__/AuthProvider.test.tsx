import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/useAuth';

jest.mock('@/lib/supabase', () => {
  const listeners: any[] = [];
  return {
    supabase: {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: jest.fn((cb) => {
          listeners.push(cb);
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
      },
      from: jest.fn(() => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      })),
    },
  };
});

function Probe() {
  const { loading, session } = useAuth();
  return <Text>{loading ? 'loading' : session ? 'signed-in' : 'signed-out'}</Text>;
}

describe('AuthProvider', () => {
  // NOTE: `@testing-library/react-native` v14 makes `render` async (it awaits
  // `test-renderer`'s async act), so the `screen` singleton is only populated
  // after the returned promise resolves. We therefore `await render(...)`.
  it('resolves to signed-out when there is no session', async () => {
    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('signed-out')).toBeTruthy());
  });
});
