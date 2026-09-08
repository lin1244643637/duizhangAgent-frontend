const OFFSET_RE = /(?:Z|[+-]\d{2}:\d{2})$/;
const BEIJING_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function currentBeijingDate(now: Date = new Date()): string {
  const parts = BEIJING_DATE_FORMATTER.formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return [values.year, values.month, values.day].join('-');
}

export function shiftBeijingDate(value: string, days: number): string {
  const date = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function currentBeijingPeriod(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}`;
}

export function parseBeijingTime(value: string): number {
  if (!value) return NaN;
  const normalized = OFFSET_RE.test(value) ? value : `${value}+08:00`;
  return new Date(normalized).getTime();
}

export function formatBeijingTime(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (!value) return '—';
  const date = typeof value === 'string'
    ? new Date(parseBeijingTime(value))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    ...options,
  });
}
