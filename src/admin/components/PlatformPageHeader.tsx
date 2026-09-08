import type { ReactNode } from 'react';

export interface PlatformPageHeaderProps {
  title: string;
  description?: string;
  primaryAction?: ReactNode;
  extra?: ReactNode;
}

export function PlatformPageHeader({
  title,
  description,
  primaryAction,
  extra,
}: PlatformPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-7 text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>}
      </div>
      {(primaryAction || extra) && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {extra}
          {primaryAction}
        </div>
      )}
    </header>
  );
}
