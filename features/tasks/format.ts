// Manual thousands-separator insertion (not Intl.NumberFormat/toLocaleString)
// so this doesn't depend on the device's bundled ICU data being complete for
// es-CO — Hermes's ICU support varies by build, and this is simple enough to
// not need it.
export function formatBudget(value: number | null): string {
  if (value === null) return 'Presupuesto a convenir';
  const rounded = Math.round(value);
  const withSeparators = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${withSeparators}`;
}

export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return 'justo ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;

  const diffDays = Math.round(diffHours / 24);
  return `hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
}
