import { render, screen, fireEvent } from '@testing-library/react-native';
import Feed from '@/app/(tabs)/index';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/features/tasks/hooks', () => ({
  useOpenTasks: jest.fn(),
}));

import { useOpenTasks } from '@/features/tasks/hooks';

describe('Feed', () => {
  it('shows a retry button on error, and pressing it calls refetch', async () => {
    const refetch = jest.fn();
    (useOpenTasks as jest.Mock).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
      isRefetching: false,
    });
    await render(<Feed />);
    expect(screen.getByText('No pudimos cargar las tareas.')).toBeTruthy();
    fireEvent.press(screen.getByText('Reintentar'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no open tasks', async () => {
    (useOpenTasks as jest.Mock).mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: jest.fn(),
      isRefetching: false,
    });
    await render(<Feed />);
    expect(screen.getByText('No hay tareas abiertas por ahora.')).toBeTruthy();
  });
});
