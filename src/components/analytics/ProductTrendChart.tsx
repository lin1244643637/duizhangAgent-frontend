import { useEffect, useMemo, useRef } from 'react';
import { LineChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { ProductTrendPoint } from '../../api/analytics';
import { ChartDownloadMenu } from './ChartDownloadMenu';
import { FullscreenButton, openChartFullscreenOnMobile } from './ChartFullscreen';
import { buildProductStoreSeries, trendPrimaryValues } from './multiStoreSeries';
import { trendPointStatusText, type TrendGranularity, type TrendMovingAverageMeta } from './trendPeriod';

use([LineChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, SVGRenderer]);

const compactCount = (n: number) => {
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toFixed(0);
};

export function formatProductPeriodLabel(period: string, granularity: TrendGranularity): string {
  if (granularity === 'day') return period.slice(5);
  if (granularity === 'week') return period.match(/W\d{1,2}$/)?.[0] || period;
  return period.slice(0, 7);
}

const escapeTooltipHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function formatProductTrendTooltip(params: unknown, points: ProductTrendPoint[]): string {
  const rows = (Array.isArray(params) ? params : [params]).filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'),
  );
  const point = points[Number(rows[0]?.dataIndex)];
  const status = trendPointStatusText(point);
  return [
    escapeTooltipHtml(point?.period || ''),
    status,
    ...rows.map(row => `${String(row.marker || '')}${escapeTooltipHtml(row.seriesName)}: ${row.value == null ? '-' : compactCount(Number(row.value || 0))}`),
  ].filter(Boolean).join('<br/>');
}

export function buildProductMovingAverageSeries(
  points: ProductTrendPoint[],
  movingAverages: TrendMovingAverageMeta[],
) {
  return movingAverages.filter(item => item.available && item.field === `ma${item.window}`).map(item => ({
    name: item.label,
    type: 'line' as const,
    smooth: true,
    symbol: 'none' as const,
    lineStyle: { type: 'dashed' as const, width: 1 },
    data: points.map(point => {
      const value = point[item.field];
      return !point.missing && typeof value === 'number' ? value : null;
    }),
  }));
}

export function buildProductComparisonSeries(
  productTrends: Record<string, ProductTrendPoint[]>,
  productLabels: Record<string, string>,
) {
  const periods = [...new Set(
    Object.values(productTrends).flatMap(productPoints => productPoints.map(point => point.period)),
  )].sort();
  const series = Object.entries(productTrends).map(([productKey, productPoints]) => {
    const pointsByPeriod = new Map(productPoints.map(point => [point.period, point]));
    return {
      name: productLabels[productKey] || productKey,
      type: 'line' as const,
      smooth: true,
      symbolSize: 5,
      data: periods.map(period => {
        const value = pointsByPeriod.get(period)?.quantity;
        return typeof value === 'number' ? value : null;
      }),
    };
  });
  return { periods, series };
}

function useEChart(option: EChartsCoreOption) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (import.meta.env.MODE === 'test') return;
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

export function ProductTrendChart({
  points,
  productName,
  productTrends,
  productLabels = {},
  storeTrends,
  storeLabels = {},
  granularity = 'day',
  movingAverages = [],
  fullscreen = false,
  onFullscreen,
}: {
  points: ProductTrendPoint[];
  productName: string;
  productTrends?: Record<string, ProductTrendPoint[]>;
  productLabels?: Record<string, string>;
  storeTrends?: Record<string, ProductTrendPoint[]>;
  storeLabels?: Record<string, string>;
  granularity?: TrendGranularity;
  movingAverages?: TrendMovingAverageMeta[];
  fullscreen?: boolean;
  onFullscreen?: () => void;
}) {
  const productComparison = useMemo(
    () => buildProductComparisonSeries(productTrends || {}, productLabels),
    [productLabels, productTrends],
  );
  const isProductComparison = Object.keys(productTrends || {}).length > 1;
  const isStoreComparison = !isProductComparison && Object.keys(storeTrends || {}).length > 1;
  const displayPoints = useMemo(() => {
    if (!isProductComparison) return points;
    return productComparison.periods.map(period => (
      Object.values(productTrends || {}).flat().find(point => point.period === period)
      || { period, quantity: 0, sales_amount: 0, order_count: 0, missing: false }
    ));
  }, [isProductComparison, points, productComparison.periods, productTrends]);
  const option = useMemo<EChartsCoreOption>(() => ({
    color: ['#0f8bbd', '#10b981', '#f59e0b', '#64748b', '#dc6b5f'],
    tooltip: {
      trigger: 'axis',
      appendToBody: !fullscreen,
      confine: true,
      formatter: (params: unknown) => formatProductTrendTooltip(params, displayPoints),
    },
    legend: {
      top: 0,
      right: fullscreen ? 44 : 84,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#64748b', fontSize: 11 },
    },
    grid: { top: 38, left: 64, right: 24, bottom: 42 },
    dataZoom: [{ type: 'inside' }],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: displayPoints.map(p => formatProductPeriodLabel(p.period, granularity)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (value: unknown) => compactCount(Number(value || 0)) },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
    },
    series: isProductComparison ? productComparison.series : isStoreComparison ? buildProductStoreSeries(storeTrends || {}, storeLabels) : [
      { name: productName, type: 'line', smooth: true, symbolSize: 5, data: trendPrimaryValues(displayPoints, 'quantity') },
      ...buildProductMovingAverageSeries(points, movingAverages),
    ],
  }), [displayPoints, fullscreen, granularity, isProductComparison, isStoreComparison, movingAverages, points, productComparison.series, productName, storeLabels, storeTrends]);
  const { ref, chartRef } = useEChart(option);
  return (
    <div className={`relative ${fullscreen ? 'h-full min-h-0' : ''}`}>
      {!fullscreen && onFullscreen ? <FullscreenButton onClick={onFullscreen} /> : null}
      <ChartDownloadMenu
        chartRef={chartRef}
        title={`${productName}单品销售趋势`}
        dateFrom={displayPoints[0]?.period}
        dateTo={displayPoints[displayPoints.length - 1]?.period}
        className={`absolute top-2 z-10 bg-white/90 shadow-sm ${fullscreen ? 'right-2' : 'right-12'}`}
      />
      <div
        ref={ref}
        onDoubleClick={() => openChartFullscreenOnMobile(onFullscreen)}
        className={`${fullscreen ? 'h-full min-h-[15rem]' : 'h-[20rem]'} w-full rounded-lg bg-slate-50`}
        role="img"
        aria-label="产品单品销量趋势折线图"
      />
    </div>
  );
}
