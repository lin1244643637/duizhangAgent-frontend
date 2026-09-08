import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { OrderRow } from '../../api/analytics';
import { ChartDownloadMenu } from './ChartDownloadMenu';
import { FullscreenButton, openChartFullscreenOnMobile } from './ChartFullscreen';

use([PieChart, TooltipComponent, SVGRenderer]);

const ORDER_CHART_COLORS = ['#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#64748b', '#f97316', '#06b6d4', '#84cc16', '#ec4899'];
const yuan = (n: number) => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compactYuan = (n: number) => Math.abs(n) >= 10000 ? `¥${(n / 10000).toFixed(1)}万` : yuan(n);

function sumOrders(rows: OrderRow[]) {
  return rows.reduce((acc, row) => ({
    orderCount: acc.orderCount + row.order_count,
    netIncome: acc.netIncome + row.net_income,
  }), { orderCount: 0, netIncome: 0 });
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

function ShareDonutChart({ rows, dimLabel, fullscreen = false }: { rows: OrderRow[]; dimLabel: string; fullscreen?: boolean }) {
  const total = sumOrders(rows);
  const chartRows = rows.map((row, index) => ({
    ...row,
    color: ORDER_CHART_COLORS[index % ORDER_CHART_COLORS.length],
    value: Math.max(0, row.net_income),
  }));
  const donutSum = chartRows.reduce((sum, row) => sum + row.value, 0);
  const option = useMemo<EChartsCoreOption>(() => ({
    color: chartRows.map(row => row.color),
    tooltip: {
      trigger: 'item',
      appendToBody: !fullscreen,
      confine: true,
      extraCssText: fullscreen ? undefined : 'z-index: 9999;',
      valueFormatter: (value: unknown) => compactYuan(Number(value || 0)),
    },
    series: [{
      name: '净实收',
      type: 'pie',
      radius: ['58%', '78%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      labelLine: { show: false },
      data: chartRows.map(row => ({
        name: row.dim_label || row.dim_key,
        value: row.value,
      })),
    }],
  }), [chartRows, fullscreen]);
  const { ref, chartRef } = useEChart(option);

  return (
    <div className={fullscreen ? 'grid h-full min-h-0 gap-4 overflow-hidden md:grid-cols-[minmax(220px,0.85fr)_minmax(240px,1fr)]' : 'grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[200px_minmax(0,1fr)]'}>
      <div className={fullscreen ? 'relative mx-auto h-full min-h-[15rem] w-full max-w-[26rem]' : 'relative mx-auto h-48 w-48'}>
        <ChartDownloadMenu
          chartRef={chartRef}
          title={`${dimLabel}净实收占比`}
          className="absolute right-0 top-0 z-10 bg-white/90 shadow-sm"
        />
        <div ref={ref} className="h-full w-full" role="img" aria-label={`${dimLabel}净实收占比环形图`} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-[11px] text-slate-400">净实收</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{compactYuan(total.netIncome)}</div>
          <div className="mt-1 text-[11px] text-slate-400">{rows.length} 项</div>
        </div>
      </div>
      <div className={`${fullscreen ? 'max-h-full' : 'max-h-52'} space-y-2 overflow-y-auto pr-1`}>
        {chartRows.map(row => {
          const share = donutSum > 0 ? Math.max(0, row.value / donutSum) : 0;
          return (
            <div key={row.dim_key} className="grid grid-cols-[minmax(120px,1fr)_86px] items-center gap-3 text-xs">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="truncate font-medium text-slate-700" title={row.dim_label || row.dim_key}>{row.dim_label || row.dim_key}</span>
                </div>
                <div className="mt-0.5 pl-4 text-[11px] tabular-nums text-slate-400">{row.order_count.toLocaleString('zh-CN')} 单</div>
              </div>
              <div className="text-right">
                <div className="tabular-nums font-medium text-slate-700">{(share * 100).toFixed(1)}%</div>
                <div className="text-[11px] tabular-nums text-slate-400">{compactYuan(row.value)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OrderCharts({
  rows,
  dimLabel,
  fullscreen = false,
  onFullscreen,
}: {
  rows: OrderRow[];
  dimLabel: string;
  fullscreen?: boolean;
  onFullscreen?: () => void;
}) {
  const [shareOpen, setShareOpen] = useState(true);
  const total = sumOrders(rows);

  return (
    <div className={`${fullscreen ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-white p-2' : 'mb-4 rounded-lg border border-slate-200 bg-white p-4'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-800">{dimLabel}占比</div>
          <div className="mt-1 text-xs text-slate-400">ECharts 环形图 · 按净实收占比展示</div>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums text-slate-900">{compactYuan(total.netIncome)}</div>
            <div className="text-xs text-slate-400">{total.orderCount.toLocaleString('zh-CN')} 单 · {rows.length} 项</div>
          </div>
          <Button autoInsertSpace={false} htmlType="button" onClick={() => setShareOpen(open => !open)} className="h-auto rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">
            {shareOpen ? '收起占比' : '展开占比'}
          </Button>
        </div>
      </div>
      {shareOpen && (
        <div className={`relative mt-4 ${fullscreen ? 'min-h-0 flex-1' : ''}`}>
          {!fullscreen && onFullscreen ? <FullscreenButton onClick={onFullscreen} /> : null}
          <div onDoubleClick={() => openChartFullscreenOnMobile(onFullscreen)} className={fullscreen ? 'h-full min-h-0' : ''}>
            <ShareDonutChart rows={rows} dimLabel={dimLabel} fullscreen={fullscreen} />
          </div>
        </div>
      )}
    </div>
  );
}
