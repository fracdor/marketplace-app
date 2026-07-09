import { postTaskSchema } from '@/features/tasks/schemas';

const valid = {
  category_id: 3,
  title: 'Arreglar fuga en la cocina',
  description: 'Hay una fuga debajo del lavaplatos que necesita reparación urgente.',
  budget_reference: '80000',
  city: 'Bogotá',
  address_approx: 'Barrio Chapinero',
};

describe('postTaskSchema', () => {
  it('accepts a fully filled valid task', () => {
    expect(postTaskSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a valid task with empty optional fields', () => {
    expect(
      postTaskSchema.safeParse({ ...valid, budget_reference: '', address_approx: '' }).success,
    ).toBe(true);
  });

  it('rejects when no category is selected (category_id 0)', () => {
    expect(postTaskSchema.safeParse({ ...valid, category_id: 0 }).success).toBe(false);
  });

  it('rejects a title shorter than 5 characters', () => {
    expect(postTaskSchema.safeParse({ ...valid, title: 'Hola' }).success).toBe(false);
  });

  it('rejects a description shorter than 20 characters', () => {
    expect(postTaskSchema.safeParse({ ...valid, description: 'Muy corta' }).success).toBe(false);
  });

  it('rejects a non-numeric budget_reference', () => {
    expect(postTaskSchema.safeParse({ ...valid, budget_reference: 'abc' }).success).toBe(false);
  });

  it('rejects a zero budget_reference', () => {
    expect(postTaskSchema.safeParse({ ...valid, budget_reference: '0' }).success).toBe(false);
  });

  it('rejects an empty city', () => {
    expect(postTaskSchema.safeParse({ ...valid, city: '' }).success).toBe(false);
  });
});
