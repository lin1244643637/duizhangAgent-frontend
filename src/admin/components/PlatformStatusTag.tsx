export type PlatformStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const toneClasses: Record<PlatformStatusTone, { badge: string; text: string }> = {
  neutral: { badge: 'bg-slate-400', text: 'text-slate-600' },
  info: { badge: 'bg-blue-500', text: 'text-blue-700' },
  success: { badge: 'bg-emerald-500', text: 'text-emerald-700' },
  warning: { badge: 'bg-amber-500', text: 'text-amber-700' },
  error: { badge: 'bg-red-500', text: 'text-red-700' },
};

export function PlatformStatusTag({ label, tone }: { label: string; tone: PlatformStatusTone }) {
  const classes = toneClasses[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${classes.text}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${classes.badge}`} />
      {label}
    </span>
  );
}
