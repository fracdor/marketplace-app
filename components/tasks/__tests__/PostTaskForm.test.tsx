import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PostTaskForm } from '@/components/tasks/PostTaskForm';

jest.mock('@/features/tasks/hooks', () => ({
  useCategories: jest.fn(),
}));

import { useCategories } from '@/features/tasks/hooks';

const categories = [
  { id: 1, name: 'Limpieza del hogar', slug: 'limpieza-hogar' },
  { id: 3, name: 'Plomería', slug: 'plomeria' },
];

beforeEach(() => {
  (useCategories as jest.Mock).mockReturnValue({ data: categories, isPending: false });
});

describe('PostTaskForm', () => {
  it('blocks submit and shows errors when required fields are empty', async () => {
    const onSubmit = jest.fn();
    await render(<PostTaskForm onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByText('Publicar'));
    await waitFor(() => expect(screen.getByText('El título debe tener al menos 5 caracteres')).toBeTruthy());
    // The category field's empty-state placeholder ("Selecciona una categoría") and the
    // schema's own error message for an unpicked category are the same Spanish string by
    // design (see postTaskSchema), so both the Pressable's placeholder Text and the
    // field's error Text render that exact text simultaneously here — hence 2, not 1.
    expect(screen.getAllByText('Selecciona una categoría')).toHaveLength(2);
    expect(screen.getByText('La descripción debe tener al menos 20 caracteres')).toBeTruthy();
    expect(screen.getByText('La ciudad es obligatoria')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('lets the user pick a category from the modal and submits the converted payload', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<PostTaskForm onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByText('Selecciona una categoría'));
    await waitFor(() => expect(screen.getByText('Plomería')).toBeTruthy());
    await fireEvent.press(screen.getByText('Plomería'));
    await waitFor(() => expect(screen.getByText('Plomería')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('title-input'), 'Arreglar fuga en la cocina');
    fireEvent.changeText(
      screen.getByTestId('description-input'),
      'Hay una fuga debajo del lavaplatos que necesita reparación urgente.',
    );
    fireEvent.changeText(screen.getByTestId('city-input'), 'Bogotá');
    await fireEvent.press(screen.getByText('Publicar'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        category_id: 3,
        title: 'Arreglar fuga en la cocina',
        description: 'Hay una fuga debajo del lavaplatos que necesita reparación urgente.',
        budget_reference: null,
        city: 'Bogotá',
        address_approx: null,
      }),
    );
  });
});
