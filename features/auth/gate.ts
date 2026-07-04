import type { Profile, Route, SessionLike } from '@/features/auth/types';

export function needsOnboarding(profile: Profile | null): boolean {
  if (!profile) return true;
  if (!profile.phone_verified) return true;
  if (!profile.full_name) return true;
  if (!profile.city) return true;
  return false;
}

export function routeFor(session: SessionLike | null, profile: Profile | null): Route {
  if (!session) return '(auth)';
  if (needsOnboarding(profile)) return 'onboarding';
  return '(tabs)';
}
