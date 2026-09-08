import { useEffect, useMemo, useRef } from 'react';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { RevenueAlert } from '../../api/analytics';
import { ChartDownloadMenu } from './ChartDownloadMenu';
import { FullscreenButton, openChartFullscreenOnMobile } from './ChartFullscreen';

use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);

function useEChart(option: EChartsCoreOption) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (import.meta.env.MODE === 'test') return;
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) return;
    const container = ref.current;
    chartRef.current = init(container, undefined, { renderer: 'svg' });
    const resize = () => {
      const chart = chartRef.current;
      if (chart && !chart.isDisposed()) chart.resize();
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    resizeObserver?.observe(container);
    window.addEventListener('resize', resize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart && !chart.isDisposed()) {
      chart.setOption(option, { notMerge: false, replaceMerge: ['series'] });
      chart.resize();
    }
  }, [option]);

  return { ref, chartRef };
}

export function RevenueAlertChart({
  alerts,
  fullscreen = false,
  onFullscreen,
}: {
  alerts: RevenueAlert[];
  fullscreen?: boolean;
  onFullscreen?: () => void;
}) {
  const chartRows = useMemo(
    () => [...alerts]
      .sort((a, b) => Math.abs(b.deviation_pct) - Math.abs(a.deviation_pct))
      .slice(0, fullscreen ? 20 : 10),
    [alerts, fullscreen],
  );
  const option = useMemo<EChartsCoreOption>(() => ({
    grid: { top: 42, right: 40, bottom: 24, left: fullscreen ? 120 : 92 },
    tooltip: {
      trigger: 'axis',
      appendToBody: !fullscreen,
      confine: true,
      valueFormatter: (value: unknown) => `${Number(value || 0).toFixed(1)}%`,
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (value: unknown) => `${Number(value || 0).toFixed(0)}%` },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: chartRows.map(alert => alert.shop_label || alert.shop_key),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#64748b', fontSize: 11, width: fullscreen ? 110 : 82, overflow: 'truncate' },
    },
    series: [{
      name: '偏离率',
      type: 'bar',
      barMaxWidth: 16,
      data: chartRows.map(alert => ({
        value: Number(alert.deviation_pct || 0) * 100,
        itemStyle: { color: alert.direction === 'under' ? '#ef4444' : '#10b981', borderRadius: 4 },
      })),
      label: {
        show: true,
        position: 'right',
        color: '#475569',
        fontSize: 11,
        formatter: (params: { value?: number }) => `${Number(params.value || 0).toFixed(0)}%`,
      },
    }],
  }), [chartRows, fullscreen]);
  const { ref, chartRef } = useEChart(option);

  return (
    <div className={`relative ${fullscreen ? 'h-full min-h-0' : ''}`}>
      {!fullscreen && onFullscreen ? <FullscreenButton onClick={onFullscreen} /> : null}
      <ChartDownloadMenu
        chartRef={chartRef}
        title="营收报警偏离率"
        className={`absolute top-2 z-10 bg-white/90 shadow-sm ${fullscreen ? 'right-2' : 'right-12'}`}
      />
      <div
        ref={ref}
        onDoubleClick={() => openChartFullscreenOnMobile(onFullscreen)}
        className={`${fullscreen ? 'h-full min-h-[15rem]' : 'h-[18rem]'} w-full rounded-lg bg-slate-50`}
        role="img"
        aria-label="营收报警偏离率图表"
      />
    </div>
  );
}
