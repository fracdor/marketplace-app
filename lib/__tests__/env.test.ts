import { readEnv } from '@/lib/env';

describe('readEnv', () => {
  it('returns url and anon key when both are present', () => {
    const env = readEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
    expect(env.supabaseUrl).toBe('http://localhost:54321');
    expect(env.supabaseAnonKey).toBe('anon-key');
  });

  it('throws when the url is missing', () => {
    expect(() => readEnv({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'x' })).toThrow(/SUPABASE_URL/);
  });

  it('throws when the anon key is missing', () => {
    expect(() => readEnv({ EXPO_PUBLIC_SUPABASE_URL: 'x' })).toThrow(/ANON_KEY/);
  });
});
