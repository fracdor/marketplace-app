import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

// NOTE: `@testing-library/react-native` v14 makes `render` async (it awaits
// `test-renderer`'s async act), so the `screen` singleton is only populated
// after the returned promise resolves. Tests therefore `await render(...)`.
describe('Button', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Ingresar" onPress={onPress} />);
    fireEvent.press(screen.getByText('Ingresar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Ingresar" onPress={onPress} loading />);
    fireEvent.press(screen.getByTestId('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Input', () => {
  it('renders a label and an error message', async () => {
    await render(<Input label="Correo" value="" onChangeText={() => {}} error="Correo inválido" />);
    expect(screen.getByText('Correo')).toBeTruthy();
    expect(screen.getByText('Correo inválido')).toBeTruthy();
  });
});
