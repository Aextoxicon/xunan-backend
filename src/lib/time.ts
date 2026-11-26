const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

export function toCst(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + CST_OFFSET_MS);
  return `${shifted.toISOString().slice(0, -1)}+08:00`;
}

export function weekStartCst(now: Date): Date {
  const cst = new Date(now.getTime() + CST_OFFSET_MS);
  const offset = (cst.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(cst.getUTCFullYear(), cst.getUTCMonth(), cst.getUTCDate() - offset) - CST_OFFSET_MS,
  );
}
