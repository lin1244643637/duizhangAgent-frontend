import { useEffect, useMemo, useRef } from 'react';
import { LineChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { LaborTrendPoint } from '../../api/analytics';
import { ChartDownloadMenu } from './ChartDownloadMenu';
import { FullscreenButton, openChartFullscreenOnMobile } from './ChartFullscreen';
import { visibleLaborTrendPoints } from './laborCompleteness';
import { buildLaborStoreSeries, trendPrimaryValues } from './multiStoreSeries';
import { trendPointStatusText, type TrendGranularity, type TrendMovingAverageMeta } from './trendPeriod';

use([LineChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, SVGRenderer]);

type LaborTrendMetric = 'hours' | 'efficiency';

const compact = (n: number, suffix = '') => {
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万${suffix}`;
  return `${Number(n || 0).toFixed(1)}${suffix}`;
};

export function formatLaborPeriodLabel(period: string, granularity: TrendGranularity): string {
  if (granularity === 'day') return period.slice(5);
  if (granularity === 'week') return period.match(/W\d{1,2}$/)?.[0] || period;
  return period.slice(0, 7);
}

const escapeTooltipHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function formatLaborTrendTooltip(
  params: unknown,
  points: LaborTrendPoint[],
  suffix: string,
): string {
  const rows = (Array.isArray(params) ? params : [params]).filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'),
  );
  const point = points[Number(rows[0]?.dataIndex)];
  const status = trendPointStatusText(point);
  return [
    escapeTooltipHtml(point?.period || ''),
    status,
    ...rows.map(row => `${String(row.marker || '')}${escapeTooltipHtml(row.seriesName)}: ${row.value == null ? '-' : compact(Number(row.value || 0), suffix)}`),
  ].filter(Boolean).join('<br/>');
}

const LABOR_AVERAGE_FIELDS = {
  hours: [
    { prefix: 'actual_hours_ma', label: '实际' },
    { prefix: 'planned_hours_ma', label: '排班' },
  ],
  efficiency: [
    { prefix: 'actual_revenue_per_hour_ma', label: '实际' },
    { prefix: 'planned_revenue_per_hour_ma', label: '排班' },
  ],
} as const;

export function buildLaborMovingAverageSeries(
  points: LaborTrendPoint[],
  movingAverages: TrendMovingAverageMeta[],
  metric: LaborTrendMetric,
) {
  return LABOR_AVERAGE_FIELDS[metric].flatMap(field => movingAverages
    .filter(item => item.available && item.field === `${field.prefix}${item.window}`)
    .map(item => ({
      name: `${field.label} MA${item.window}`,
      type: 'line' as const,
      smooth: true,
      symbol: 'none' as const,
      lineStyle: { type: 'dashed' as const, width: 1 },
      data: points.map(point => {
        const value = point[item.field];
        return !point.missing && typeof value === 'number' ? value : null;
      }),
    })));
}

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

export function LaborTrendChart({
  points,
  metric,
  storeTrends,
  storeLabels = {},
  granularity = 'day',
  movingAverages = [],
  fullscreen = false,
  onFullscreen,
}: {
  points: LaborTrendPoint[];
  metric: LaborTrendMetric;
  storeTrends?: Record<string, LaborTrendPoint[]>;
  storeLabels?: Record<string, string>;
  granularity?: TrendGranularity;
  movingAverages?: TrendMovingAverageMeta[];
  fullscreen?: boolean;
  onFullscreen?: () => void;
}) {
  const isHours = metric === 'hours';
  const isComparison = Object.keys(storeTrends || {}).length > 1;
  const suffix = isHours ? 'h' : '元/h';
  const visiblePoints = useMemo(() => visibleLaborTrendPoints(points), [points]);
  const visiblePeriods = useMemo(() => visiblePoints.map(point => point.period), [visiblePoints]);
  const option = useMemo<EChartsCoreOption>(() => ({
    color: ['#0f8bbd', '#f59e0b', 'rgba(15,139,189,0.82)', 'rgba(15,139,189,0.70)', 'rgba(15,139,189,0.58)', 'rgba(245,158,11,0.82)', 'rgba(245,158,11,0.70)', 'rgba(245,158,11,0.58)'],
    tooltip: {
      trigger: 'axis',
      appendToBody: !fullscreen,
      confine: true,
      formatter: (params: unknown) => formatLaborTrendTooltip(params, visiblePoints, suffix),
    },
    legend: {
      top: 0,
      right: fullscreen ? 44 : 84,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#64748b', fontSize: 11 },
    },
    grid: { top: 62, left: 64, right: 24, bottom: 44 },
    dataZoom: [{ type: 'inside' }],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: visiblePoints.map(point => formatLaborPeriodLabel(point.period, granularity)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (value: unknown) => compact(Number(value || 0), suffix) },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
    },
    series: isComparison ? buildLaborStoreSeries(storeTrends || {}, storeLabels, metric, visiblePeriods) : isHours ? [
      { name: '实际工时', type: 'line', smooth: true, symbolSize: 5, data: trendPrimaryValues(visiblePoints, 'actual_hours') },
      { name: '排班工时', type: 'line', smooth: true, symbolSize: 5, data: trendPrimaryValues(visiblePoints, 'planned_hours') },
      ...buildLaborMovingAverageSeries(visiblePoints, movingAverages, 'hours'),
    ] : [
      { name: '实际人效', type: 'line', smooth: true, symbolSize: 5, data: trendPrimaryValues(visiblePoints, 'actual_revenue_per_hour') },
      { name: '排班人效', type: 'line', smooth: true, symbolSize: 5, data: trendPrimaryValues(visiblePoints, 'planned_revenue_per_hour') },
      ...buildLaborMovingAverageSeries(visiblePoints, movingAverages, 'efficiency'),
    ],
  }), [fullscreen, granularity, isComparison, isHours, metric, movingAverages, storeLabels, storeTrends, suffix, visiblePeriods, visiblePoints]);
  const { ref, chartRef } = useEChart(option);
  return (
    <div className={`relative ${fullscreen ? 'h-full min-h-0' : ''}`}>
      {!fullscreen && onFullscreen ? <FullscreenButton onClick={onFullscreen} /> : null}
      <ChartDownloadMenu
        chartRef={chartRef}
        title={isHours ? '人效工时趋势' : '人效趋势'}
        dateFrom={visiblePoints[0]?.period}
        dateTo={visiblePoints[visiblePoints.length - 1]?.period}
        className={`absolute top-2 z-10 bg-white/90 shadow-sm ${fullscreen ? 'right-2' : 'right-12'}`}
      />
      <div
        ref={ref}
        onDoubleClick={() => openChartFullscreenOnMobile(onFullscreen)}
        className={`${fullscreen ? 'h-full min-h-[15rem]' : 'h-[20rem]'} w-full rounded-lg bg-slate-50`}
        role="img"
        aria-label={isHours ? '人效工时趋势折线图' : '人效元每工时趋势折线图'}
      />
    </div>
  );
}
