export interface Profile {
  id: string;
  full_name: string | null;
  city: string | null;
  phone: string | null;
  phone_verified: boolean;
  avatar_url: string | null;
}

// Minimal shape we consume from Supabase's Session; avoids importing the SDK in pure logic.
export interface SessionLike {
  userId: string;
}

export type Route = '(auth)' | 'onboarding' | '(tabs)';
