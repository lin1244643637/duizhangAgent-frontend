import { useEffect, useState, type ReactNode } from 'react';
import { Button as MobileButton } from 'antd-mobile';

export function useAnalyticsChartFullscreen<T extends string>() {
  const [fullscreenChart, setFullscreenChart] = useState<T | null>(null);
  const [fullscreenPortrait, setFullscreenPortrait] = useState(false);

  const openFullscreen = (chart: T) => {
    setFullscreenChart(chart);
    setFullscreenPortrait(window.innerWidth < window.innerHeight);
    void document.documentElement.requestFullscreen?.().catch(() => {});
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'landscape') => Promise<void>;
    };
    void orientation?.lock?.('landscape').catch(() => {});
    window.setTimeout(() => {
      setFullscreenPortrait(window.innerWidth < window.innerHeight);
      window.dispatchEvent(new Event('resize'));
    }, 350);
  };

  const closeFullscreen = () => {
    setFullscreenChart(null);
    setFullscreenPortrait(false);
    const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
    orientation?.unlock?.();
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    if (!fullscreenChart) return;
    const updatePortrait = () => setFullscreenPortrait(window.innerWidth < window.innerHeight);
    updatePortrait();
    window.addEventListener('resize', updatePortrait);
    window.addEventListener('orientationchange', updatePortrait);
    const timer = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', updatePortrait);
      window.removeEventListener('orientationchange', updatePortrait);
    };
  }, [fullscreenChart]);

  return { fullscreenChart, fullscreenPortrait, openFullscreen, closeFullscreen };
}

export function openChartFullscreenOnMobile(onFullscreen?: () => void): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(max-width: 767px)').matches) onFullscreen?.();
}

export function ChartFullscreenLayer({
  title,
  subtitle,
  controls,
  children,
  showRotateHint,
  onClose,
}: {
  title: string;
  subtitle: string;
  controls?: ReactNode;
  children: ReactNode;
  showRotateHint: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, []);

  return (
    <div className="chart-fullscreen-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="chart-fullscreen-shell">
        <div className="chart-fullscreen-header flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
            <div className="truncate text-[11px] text-slate-500">{subtitle}</div>
          </div>
          <div className="relative flex shrink-0 items-center gap-1.5">
            {controls}
            <MobileButton size="mini" fill="outline" onClick={onClose}>
              退出
            </MobileButton>
          </div>
        </div>
        <div className="chart-fullscreen-content min-h-0 flex-1 bg-white p-2">
          {children}
        </div>
      </div>
      {showRotateHint ? (
        <div className="chart-fullscreen-rotate-hint">请将手机横屏查看完整图表</div>
      ) : null}
    </div>
  );
}

export function FullscreenFilterButton({
  label = '筛选',
  expanded,
  onClick,
}: {
  label?: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="chart-fullscreen-filter-button"
      onClick={onClick}
      aria-expanded={expanded}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export function FullscreenButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="absolute right-2 top-2 z-10 flex h-9 min-w-9 items-center justify-center rounded-full border border-slate-200 bg-white/90 px-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur active:bg-slate-100 md:hidden"
      aria-label="全屏横屏查看图表"
      title="全屏"
      onClick={onClick}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
      </svg>
    </button>
  );
}
