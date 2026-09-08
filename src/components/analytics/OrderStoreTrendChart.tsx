import { useEffect, useMemo, useRef } from 'react';
import { LineChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

import type { RevenueSeriesPoint } from './dailyFactSelectors';
import { ChartDownloadMenu } from './ChartDownloadMenu';
import type { TrendGranularity } from './trendPeriod';

use([LineChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, SVGRenderer]);

const movingAverageFields = {
  day: [['ma7', 'MA7'], ['ma30', 'MA30'], ['ma180', 'MA180']],
  week: [['ma4', 'MA4'], ['ma12', 'MA12'], ['ma26', 'MA26']],
  month: [['ma3', 'MA3'], ['ma6', 'MA6'], ['ma12', 'MA12']],
} as const;

export function OrderStoreTrendChart({
  series,
  storeLabel,
  granularity,
}: {
  series: Array<{ key: string; label: string; points: RevenueSeriesPoint[] }>;
  storeLabel: string;
  granularity: TrendGranularity;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  const points = series[0]?.points || [];
  const option = useMemo<EChartsCoreOption>(() => ({
    color: ['#0f8bbd', '#10b981', '#f59e0b', '#64748b'],
    tooltip: { trigger: 'axis', confine: true },
    legend: { top: 0, right: 52, textStyle: { color: '#64748b', fontSize: 11 } },
    grid: { top: 58, left: 68, right: 24, bottom: 44 },
    dataZoom: [{ type: 'inside' }],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map(point => point.period),
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#94a3b8', formatter: (value: unknown) => `¥${Number(value || 0).toLocaleString('zh-CN')}` },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
    },
    series: [
      ...series.map(item => ({
        name: item.label, type: 'line' as const, smooth: true, symbolSize: 5,
        data: item.points.map(point => point.missing ? null : point.net_income_cent / 100),
      })),
      ...(series.length === 1 ? movingAverageFields[granularity].map(([field, label]) => ({
        name: label, type: 'line' as const, smooth: true, symbol: 'none' as const,
        lineStyle: { type: 'dashed' as const, width: 1 },
        data: points.map(point => point.in_progress || point[field] == null ? null : Number(point[field]) / 100),
      })) : []),
    ],
  }), [granularity, points, series]);

  useEffect(() => {
    if (!ref.current || import.meta.env.MODE === 'test') return;
    const chart = init(ref.current, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    const resize = () => chart.resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(ref.current);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart && !chart.isDisposed()) chart.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div className="relative">
      <ChartDownloadMenu
        chartRef={chartRef}
        title={`${storeLabel}订单趋势`}
        dateFrom={points[0]?.date_from}
        dateTo={points[points.length - 1]?.date_to}
        className="absolute right-2 top-2 z-10 bg-white/90 shadow-sm"
      />
      <div ref={ref} className="h-[22rem] w-full rounded-lg bg-slate-50" role="img" aria-label={`${storeLabel}订单趋势图`} />
    </div>
  );
}
