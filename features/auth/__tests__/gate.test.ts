import { needsOnboarding, routeFor } from '@/features/auth/gate';
import type { Profile } from '@/features/auth/types';

const complete: Profile = {
  id: 'u1', full_name: 'Ana', city: 'Bogotá', phone: '3001234567',
  phone_verified: true, avatar_url: null,
};

describe('needsOnboarding', () => {
  it('is false for a complete profile', () => {
    expect(needsOnboarding(complete)).toBe(false);
  });
  it('is true when phone is not verified', () => {
    expect(needsOnboarding({ ...complete, phone_verified: false })).toBe(true);
  });
  it('is true when full_name is missing', () => {
    expect(needsOnboarding({ ...complete, full_name: null })).toBe(true);
  });
  it('is true when city is missing', () => {
    expect(needsOnboarding({ ...complete, city: '' as unknown as string })).toBe(true);
  });
  it('is true when profile is null', () => {
    expect(needsOnboarding(null)).toBe(true);
  });
});

describe('routeFor', () => {
  it('routes signed-out users to (auth)', () => {
    expect(routeFor(null, null)).toBe('(auth)');
  });
  it('routes signed-in-but-incomplete users to onboarding', () => {
    expect(routeFor({ userId: 'u1' }, { ...complete, phone_verified: false })).toBe('onboarding');
  });
  it('routes signed-in-and-complete users to (tabs)', () => {
    expect(routeFor({ userId: 'u1' }, complete)).toBe('(tabs)');
  });
});
