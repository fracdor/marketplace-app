import { createOfferSchema } from '@/features/offers/schemas';

describe('createOfferSchema', () => {
  it('accepts a valid price with a message', () => {
    expect(createOfferSchema.safeParse({ price: '85000', message: 'Puedo empezar mañana' }).success).toBe(true);
  });

  it('accepts a valid price with an empty message', () => {
    expect(createOfferSchema.safeParse({ price: '85000', message: '' }).success).toBe(true);
  });

  it('rejects an empty price', () => {
    expect(createOfferSchema.safeParse({ price: '', message: '' }).success).toBe(false);
  });

  it('rejects a non-numeric price', () => {
    expect(createOfferSchema.safeParse({ price: 'abc', message: '' }).success).toBe(false);
  });

  it('rejects a zero price', () => {
    expect(createOfferSchema.safeParse({ price: '0', message: '' }).success).toBe(false);
  });

  it('trims whitespace around the price before validating', () => {
    expect(createOfferSchema.safeParse({ price: '  85000  ', message: '' }).success).toBe(true);
  });
});
