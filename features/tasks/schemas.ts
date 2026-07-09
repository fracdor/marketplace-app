import { z } from 'zod';

// category_id defaults to 0 in the form (meaning "nothing picked yet" — 0 is
// never a real category id since categories.id starts at 1), so the minimum
// is what actually enforces "you must pick one."
export const postTaskSchema = z.object({
  category_id: z.number().min(1, 'Selecciona una categoría'),
  title: z.string().trim().min(5, 'El título debe tener al menos 5 caracteres'),
  description: z.string().min(20, 'La descripción debe tener al menos 20 caracteres'),
  // Kept as a raw string here (matches what a numeric TextInput holds); the
  // form converts it to `number | null` before calling onSubmit. Empty is
  // valid (budget is optional); anything else must be a positive integer.
  budget_reference: z.string().refine(
    (v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0),
    { message: 'El presupuesto debe ser un número entero mayor a cero' },
  ),
  city: z.string().trim().min(1, 'La ciudad es obligatoria'),
  address_approx: z.string(),
});
export type PostTaskFormValues = z.infer<typeof postTaskSchema>;
