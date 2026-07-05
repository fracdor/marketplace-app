import { formatBudget, formatRelativeTime } from '@/features/tasks/format';

describe('formatBudget', () => {
  it('formats a budget with thousands separators and a $ prefix', () => {
    expect(formatBudget(80000)).toBe('$80.000');
  });

  it('formats a larger budget with multiple separators', () => {
    expect(formatBudget(1500000)).toBe('$1.500.000');
  });

  it('returns a placeholder when there is no budget', () => {
    expect(formatBudget(null)).toBe('Presupuesto a convenir');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-04T12:00:00.000Z');

  it('shows "justo ahora" for less than a minute', () => {
    expect(formatRelativeTime('2026-07-04T11:59:40.000Z', now)).toBe('justo ahora');
  });

  it('shows minutes for less than an hour', () => {
    expect(formatRelativeTime('2026-07-04T11:45:00.000Z', now)).toBe('hace 15 min');
  });

  it('shows singular hour', () => {
    expect(formatRelativeTime('2026-07-04T11:00:00.000Z', now)).toBe('hace 1 hora');
  });

  it('shows plural hours', () => {
    expect(formatRelativeTime('2026-07-04T09:00:00.000Z', now)).toBe('hace 3 horas');
  });

  it('shows plural days', () => {
    expect(formatRelativeTime('2026-07-02T12:00:00.000Z', now)).toBe('hace 2 días');
  });
});
