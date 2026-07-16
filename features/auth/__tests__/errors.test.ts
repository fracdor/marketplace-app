import { mapAuthError } from '@/features/auth/errors';

const GENERIC = 'Algo salió mal. Intenta de nuevo.';

describe('mapAuthError', () => {
  it('maps invalid credentials', () => {
    expect(mapAuthError('Invalid login credentials')).toBe('Correo o contraseña incorrectos.');
  });

  it('maps user already registered', () => {
    expect(mapAuthError('User already registered')).toBe('Ya existe una cuenta con este correo.');
  });

  it('maps email not confirmed', () => {
    expect(mapAuthError('Email not confirmed')).toBe(
      'Debes confirmar tu correo antes de ingresar.',
    );
  });

  it('maps weak-password variants', () => {
    expect(mapAuthError('Password should be at least 6 characters')).toBe(
      'La contraseña es demasiado débil.',
    );
    expect(mapAuthError('Weak password')).toBe('La contraseña es demasiado débil.');
  });

  it('maps rate-limit variants', () => {
    expect(mapAuthError('Email rate limit exceeded')).toBe(
      'Demasiados intentos. Espera un momento e intenta de nuevo.',
    );
    expect(mapAuthError('For security purposes, you can only request this after 32 seconds')).toBe(
      'Demasiados intentos. Espera un momento e intenta de nuevo.',
    );
  });

  it('is case-insensitive', () => {
    expect(mapAuthError('INVALID LOGIN CREDENTIALS')).toBe('Correo o contraseña incorrectos.');
  });

  it('falls back to a generic Spanish message for unknown errors', () => {
    expect(mapAuthError('Some unexpected server error')).toBe(GENERIC);
  });

  it('falls back to generic for empty input', () => {
    expect(mapAuthError('')).toBe(GENERIC);
  });

  it('maps invalid_phone', () => {
    expect(mapAuthError('invalid_phone')).toBe('Número de celular inválido.');
  });

  it('maps rate_limited', () => {
    expect(mapAuthError('rate_limited')).toBe(
      'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    );
  });

  it('maps invalid_code', () => {
    expect(mapAuthError('invalid_code')).toBe('Código incorrecto.');
  });
});
