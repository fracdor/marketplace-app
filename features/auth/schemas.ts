import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = loginSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const phoneSchema = z.object({
  phone: z
    .string()
    .regex(/^\d{10}$/, 'Debe ser un celular de 10 dígitos'),
});
export type PhoneInput = z.infer<typeof phoneSchema>;

export const profileSchema = z.object({
  full_name: z.string().min(1, 'El nombre es obligatorio'),
  city: z.string().min(1, 'La ciudad es obligatoria'),
});
export type ProfileInput = z.infer<typeof profileSchema>;
