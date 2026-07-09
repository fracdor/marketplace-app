import { z } from 'zod';

export const createOfferSchema = z.object({
  price: z.string().trim().refine(
    (v) => /^\d+$/.test(v) && Number(v) > 0,
    { message: 'El precio debe ser un número entero mayor a cero' },
  ),
  message: z.string(),
});
export type CreateOfferFormValues = z.infer<typeof createOfferSchema>;
