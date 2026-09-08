import type { ReactNode } from 'react';

export interface PlatformFilterBarProps {
  children: ReactNode;
  resultCount?: number;
  actions?: ReactNode;
}

export function PlatformFilterBar({ children, resultCount, actions }: PlatformFilterBarProps) {
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {resultCount !== undefined && <span className="text-xs text-slate-500">共 {resultCount} 条</span>}
        {actions}
      </div>
    </section>
  );
}
