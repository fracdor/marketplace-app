import { loginSchema, registerSchema, phoneSchema, profileSchema } from '@/features/auth/schemas';

describe('loginSchema', () => {
  it('accepts a valid email + password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'secret12' }).success).toBe(true);
  });
  it('rejects an invalid email', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'secret12' }).success).toBe(false);
  });
  it('rejects a short password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('accepts matching passwords', () => {
    expect(
      registerSchema.safeParse({ email: 'a@b.co', password: 'secret12', confirm: 'secret12' }).success,
    ).toBe(true);
  });
  it('rejects mismatched passwords', () => {
    expect(
      registerSchema.safeParse({ email: 'a@b.co', password: 'secret12', confirm: 'other123' }).success,
    ).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('accepts a 10-digit Colombian mobile', () => {
    expect(phoneSchema.safeParse({ phone: '3001234567' }).success).toBe(true);
  });
  it('rejects a number that is not 10 digits', () => {
    expect(phoneSchema.safeParse({ phone: '12345' }).success).toBe(false);
  });
  it('rejects non-digits', () => {
    expect(phoneSchema.safeParse({ phone: '30012abcde' }).success).toBe(false);
  });
});

describe('profileSchema', () => {
  it('accepts a full name + city', () => {
    expect(profileSchema.safeParse({ full_name: 'Ana Ruiz', city: 'Bogotá' }).success).toBe(true);
  });
  it('rejects an empty full name', () => {
    expect(profileSchema.safeParse({ full_name: '', city: 'Bogotá' }).success).toBe(false);
  });
  it('rejects an empty city', () => {
    expect(profileSchema.safeParse({ full_name: 'Ana', city: '' }).success).toBe(false);
  });
});
