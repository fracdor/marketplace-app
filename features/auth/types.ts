import type { Database } from '@/lib/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

// Minimal shape we consume from Supabase's Session; avoids importing the SDK in pure logic.
export interface SessionLike {
  userId: string;
}

export type Route = '(auth)' | 'onboarding' | '(tabs)';
