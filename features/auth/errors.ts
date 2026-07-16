// Maps raw Supabase auth error messages (English) to Spanish, user-facing text.
// Supabase surfaces auth failures as plain English strings on `error.message`;
// the rest of the UI is in Spanish, so we translate the handful of common ones
// and fall back to a generic Spanish message for anything unrecognized.

const GENERIC = 'Algo salió mal. Intenta de nuevo.';

// Ordered list of [needle, spanish] pairs. `needle` is matched
// case-insensitively as a substring, so partial/variant wording still maps.
const RULES: ReadonlyArray<readonly [string, string]> = [
  ['invalid login credentials', 'Correo o contraseña incorrectos.'],
  ['user already registered', 'Ya existe una cuenta con este correo.'],
  ['email not confirmed', 'Debes confirmar tu correo antes de ingresar.'],
  // Weak-password variants: "Password should be at least 6 characters", "weak password".
  ['password should be at least', 'La contraseña es demasiado débil.'],
  ['weak password', 'La contraseña es demasiado débil.'],
  // Rate-limit variants: "Email rate limit exceeded", "For security purposes,
  // you can only request this after N seconds", "Request rate limit reached".
  ['rate limit', 'Demasiados intentos. Espera un momento e intenta de nuevo.'],
  ['you can only request this after', 'Demasiados intentos. Espera un momento e intenta de nuevo.'],
  ['invalid_phone', 'Número de celular inválido.'],
  ['rate_limited', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'],
  ['invalid_code', 'Código incorrecto.'],
];

export function mapAuthError(message: string): string {
  if (!message) return GENERIC;
  const normalized = message.toLowerCase();
  for (const [needle, spanish] of RULES) {
    if (normalized.includes(needle)) return spanish;
  }
  return GENERIC;
}
