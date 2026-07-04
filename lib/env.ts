type RawEnv = Record<string, string | undefined>;

export interface Env {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function readEnv(raw: RawEnv): Env {
  const supabaseUrl = raw.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = raw.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');
  return { supabaseUrl, supabaseAnonKey };
}

// Lazy + memoized: reading process.env at module load would throw in Jest
// (where EXPO_PUBLIC_* are undefined). getEnv() is only called by the real
// Supabase client, never in tests (which mock @/lib/supabase).
let cached: Env | null = null;
export function getEnv(): Env {
  if (!cached) cached = readEnv(process.env as RawEnv);
  return cached;
}
