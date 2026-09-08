import type { ReactNode } from 'react';
import type { PlatformStatusTone } from './PlatformStatusTag';

export interface PlatformMetric {
  label: string;
  value: ReactNode;
  tone?: PlatformStatusTone;
  hint?: string;
}

const valueToneClasses: Record<PlatformStatusTone, string> = {
  neutral: 'text-slate-900',
  info: 'text-blue-700',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  error: 'text-red-700',
};

export function PlatformMetricStrip({ items }: { items: PlatformMetric[] }) {
  return (
    <section aria-label="关键指标" className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="grid min-w-0 divide-y divide-slate-100 sm:grid-flow-col sm:grid-cols-none sm:auto-cols-fr sm:divide-x sm:divide-y-0">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 px-4 py-3">
            <div className="text-xs leading-5 text-slate-500">{item.label}</div>
            <div className={`mt-0.5 truncate text-lg font-semibold leading-6 ${valueToneClasses[item.tone ?? 'neutral']}`}>
              {item.value}
            </div>
            {item.hint && <div className="mt-0.5 truncate text-xs leading-4 text-slate-400">{item.hint}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
