import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, Table, type TableColumnsType } from 'antd';
import { getLaborEfficiency, getLaborEfficiencyDetail, getLaborEfficiencyTrend, listStoreScopeTree, type LaborEfficiencyDetail, type LaborRow, type LaborTrendPoint, type LaborTrendResult } from '../../api/analytics';
import { sumMoney } from '../../utils/money';
import {
  fetchOperationsLabor,
  type ComparisonMode,
  type MetricComparison,
} from '../../features/operations-analysis/api/client';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ChartFullscreenLayer, FullscreenFilterButton, useAnalyticsChartFullscreen } from './ChartFullscreen';
import { DetailPeriodSelect } from './DetailPeriodSelect';
import {
  ComparisonDisplaySelect,
  ComparisonModeSelect,
  ComparisonPeriodNote,
  PeriodComparisonText,
  type ComparisonDisplayMode,
  type ComparisonValueFormat,
} from './PeriodComparison';
import {
  Card, MobileField, MobileInlineFilter, compactYuan, isAbortError, yuan,
} from './shared';
import { getLaborDailyFacts } from '../../api/analyticsDailyFacts';
import type { DailyFactRecord } from '../../api/analyticsDailyTypes';
import { completenessStatus, normalizeDataStatus } from './completeness';
import { MovingAverageStatus } from './MovingAverageStatus';
import { buildLaborScopeTrendSeries } from './scopeTrendSeries';
import { visibleLaborTrendPoints } from './laborCompleteness';
import { StoreScopePicker } from './StoreScopePicker';
import { resolveStoreScopeSelection, type ExplicitStoreScope, type StoreScopeNode } from './storeScope';
import { TrendPeriodControls } from './TrendPeriodControls';
import { buildDetailPeriodOptions, defaultTrendRange, trendHistoryStart, type TrendGranularity, type TrendMovingAverageMeta } from './trendPeriod';
import { groupDailyFacts, movingAverage } from './dailyFactSelectors';

const LaborTrendChart = lazy(() => import('./LaborTrendChart').then(module => ({ default: module.LaborTrendChart })));

type LaborDetailMode = 'revenue' | 'labor';

type LaborDisplaySnapshot = {
  trend: LaborTrendResult;
  granularity: TrendGranularity;
  includeCurrent: boolean;
  dateFrom: string;
  dateTo: string;
  departmentKeys: string[];
  scopes: ExplicitStoreScope[];
  compareStores: boolean;
  storeLabel: string;
  storeLabels: Record<string, string>;
};

type LaborDetailSnapshot = {
  rows: LaborRow[];
  dateFrom: string;
  dateTo: string;
  departmentKeys: string[];
};

type LaborDailyFactMode = 'loading' | 'ready' | 'fallback';

export type LaborDailyStoreFact = {
  store_key: string;
  store_label?: string | null;
  net_revenue_cent?: number;
  actual_hours?: number;
  planned_hours?: number;
  revenue_per_hour_cent?: number | null;
  planned_revenue_per_hour_cent?: number | null;
  headcount?: number;
  data_status?: 'ready' | 'incomplete' | 'missing' | string;
};

export type LaborDailyFact = {
  date: string;
  data_status?: 'ready' | 'incomplete' | 'missing' | string;
  stores?: Record<string, LaborDailyStoreFact>;
};

function centsToYuan(value: number | null | undefined): number {
  return Number((Number(value || 0) / 100).toFixed(2));
}

function usableLaborFacts(facts: LaborDailyFact[]): (LaborDailyFact & { complete: true })[] {
  return facts
    .filter(fact => normalizeDataStatus(fact.data_status) === 'ready')
    .map(fact => ({ ...fact, complete: true as const }));
}

function aggregateLaborStores(facts: LaborDailyFact[], storeKeys: string[] = []): LaborRow[] {
  const selected = new Set(storeKeys.filter(Boolean));
  const byStore = new Map<string, LaborRow>();
  for (const fact of usableLaborFacts(facts)) {
    for (const [key, store] of Object.entries(fact.stores || {})) {
      const storeKey = String(store.store_key || key);
      if (selected.size && !selected.has(storeKey) && !selected.has(key)) continue;
      const current = byStore.get(storeKey) || {
        store_key: storeKey,
        store_label: store.store_label || storeKey,
        net_revenue: 0,
        actual_hours: 0,
        planned_hours: 0,
        revenue_per_hour: 0,
        headcount: 0,
        hours_gap: 0,
        uncovered: false,
      };
      current.net_revenue = Number((current.net_revenue + centsToYuan(store.net_revenue_cent)).toFixed(2));
      current.actual_hours = Number((current.actual_hours + Number(store.actual_hours || 0)).toFixed(2));
      current.planned_hours = Number((current.planned_hours + Number(store.planned_hours || 0)).toFixed(2));
      current.headcount = Math.max(Number(current.headcount || 0), Number(store.headcount || 0));
      current.hours_gap = Number((current.planned_hours - current.actual_hours).toFixed(2));
      current.revenue_per_hour = current.actual_hours
        ? Number((current.net_revenue / current.actual_hours).toFixed(2))
        : 0;
      byStore.set(storeKey, current);
    }
  }
  return [...byStore.values()].sort((left, right) => Number(right.net_revenue || 0) - Number(left.net_revenue || 0));
}

function mergeLaborHeadcount(rows: LaborRow[], summaryRows: LaborRow[]): LaborRow[] {
  const byStore = new Map(summaryRows.map(row => [String(row.store_key), Number(row.headcount || 0)]));
  return rows.map(row => ({
    ...row,
    headcount: byStore.has(String(row.store_key))
      ? Number(byStore.get(String(row.store_key)) || 0)
      : Number(row.headcount || 0),
  }));
}

function laborFactFromRecord(record: DailyFactRecord<LaborDailyFact>): LaborDailyFact {
  const completeness = record.completeness || {};
  return {
    ...record.payload,
    date: record.date,
    data_status: completenessStatus(completeness, record.payload.data_status),
  };
}

function aggregateLaborPoint(period: ReturnType<typeof groupDailyFacts<LaborDailyFact>>[number], storeKeys: string[] = []): LaborTrendPoint {
  const rows = aggregateLaborStores(period.facts, storeKeys);
  const netRevenue = sumMoney(rows.map(row => row.net_revenue));
  const actualHours = rows.reduce((sum, row) => sum + Number(row.actual_hours || 0), 0);
  const plannedHours = rows.reduce((sum, row) => sum + Number(row.planned_hours || 0), 0);
  return {
    period: period.key,
    period_start: period.dateFrom,
    period_end: period.dateTo,
    net_revenue: netRevenue,
    actual_hours: Number(actualHours.toFixed(2)),
    planned_hours: Number(plannedHours.toFixed(2)),
    actual_revenue_per_hour: actualHours ? Number((netRevenue / actualHours).toFixed(2)) : 0,
    planned_revenue_per_hour: plannedHours ? Number((netRevenue / plannedHours).toFixed(2)) : 0,
    headcount: rows.reduce((sum, row) => sum + Number(row.headcount || 0), 0),
    missing: !period.complete,
    ...(period.inProgress ? { in_progress: true } : {}),
    hours_synced: true,
  };
}

function laborMaFields(granularity: TrendGranularity): [string, number][] {
  const windows = granularity === 'week' ? [4, 12, 26] : granularity === 'month' ? [3, 6, 12] : [7, 30, 180];
  const prefixes = ['actual_hours', 'planned_hours', 'actual_revenue_per_hour', 'planned_revenue_per_hour'];
  return windows.flatMap(window => prefixes.map(prefix => [`${prefix}_ma${window}`, window] as [string, number]));
}

function applyLaborMovingAverages(points: LaborTrendPoint[], granularity: TrendGranularity): TrendMovingAverageMeta[] {
  return laborMaFields(granularity).map(([field, window]) => {
    const sourceField = field.replace(/_ma\d+$/, '') as keyof LaborTrendPoint;
    const averages = movingAverage(
      points.map(point => point.missing || point.in_progress ? null : Number(point[sourceField] || 0)),
      window,
      granularity !== 'day',
    );
    points.forEach((point, index) => {
      point[field] = averages[index];
    });
    return {
      field,
      label: `MA${window}`,
      window,
      available: averages.some(value => typeof value === 'number'),
      available_periods: points.length,
    };
  });
}

export function laborTrendFromFacts(
  facts: LaborDailyFact[],
  granularity: TrendGranularity,
  includeCurrent: boolean,
  storeKeys: string[],
  compareStores: boolean,
  expectedDateFrom: string,
  expectedDateTo: string,
  visibleDateFrom: string = expectedDateFrom,
  visibleDateTo: string = expectedDateTo,
): LaborTrendResult {
  const readyFacts = usableLaborFacts(facts);
  const periods = groupDailyFacts<LaborDailyFact>(
    readyFacts,
    granularity,
    true,
    expectedDateFrom,
    expectedDateTo,
  );
  const allPoints = periods.map(period => aggregateLaborPoint(period, storeKeys));
  const moving_averages = applyLaborMovingAverages(allPoints, granularity);
  const isVisible = (point: LaborTrendPoint) => (
    String(point.period_end || '') >= visibleDateFrom && String(point.period_start || '') <= visibleDateTo
  );
  const points = (includeCurrent ? allPoints : allPoints.filter(point => !point.missing && !point.in_progress)).filter(isVisible);
  const storeTrendKeys = compareStores ? storeKeys : [];
  const store_trends = Object.fromEntries(storeTrendKeys.map(key => {
    const allStorePoints = periods.map(period => aggregateLaborPoint(period, [key]));
    applyLaborMovingAverages(allStorePoints, granularity);
    return [key, (includeCurrent ? allStorePoints : allStorePoints.filter(point => !point.missing && !point.in_progress)).filter(isVisible)];
  }));
  return {
    granularity,
    period: `${points[0]?.period || ''}_${points[points.length - 1]?.period || ''}`,
    store_key: 'ALL',
    points,
    moving_averages,
    store_trends,
  };
}

function laborDetailFromFacts(
  facts: LaborDailyFact[],
  dateFrom: string,
  dateTo: string,
  departmentKeys: string[],
): LaborDetailSnapshot {
  const periodFacts = facts.filter(fact => fact.date >= dateFrom && fact.date <= dateTo);
  return {
    rows: aggregateLaborStores(periodFacts),
    dateFrom,
    dateTo,
    departmentKeys: [...departmentKeys],
  };
}

function beijingTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function LaborMobileCards({
  rows,
  onOpenDetail,
}: {
  rows: LaborRow[];
  onOpenDetail: (row: LaborRow, mode: LaborDetailMode) => void;
}) {
  return (
    <div className="space-y-2 md:hidden">
      {rows.map(row => (
        <div key={row.store_key} className={`rounded-lg border p-3 ${row.uncovered ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400">门店</div>
              <div className={`mt-0.5 truncate text-sm font-medium ${row.uncovered ? 'text-amber-700' : 'text-slate-800'}`}>
                {row.uncovered ? `未映射：${row.store_label || row.store_key}` : row.store_label || row.store_key}
              </div>
            </div>
            <MobileField label="实际人效" value={row.revenue_per_hour ? yuan(Number(row.revenue_per_hour)) : '—'} tone="strong" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            <MobileField label="净实收" value={yuan(Number(row.net_revenue || 0))} tone={row.uncovered ? 'warning' : 'default'} />
            <MobileField label="实际工时" value={Number(row.actual_hours || 0).toFixed(1)} />
            <MobileField label="排班工时" value={Number(row.planned_hours || 0).toFixed(1)} />
            <MobileField label="排班人效" value={Number(row.planned_hours || 0) ? yuan(Number(row.net_revenue || 0) / Number(row.planned_hours || 0)) : '—'} />
            <MobileField label="人数" value={String(row.headcount || 0)} />
            <MobileField label="排班缺口" value={`${Number(row.hours_gap || 0).toFixed(1)} 时`} />
          </div>
          {!row.uncovered && (
            <div className="mt-3 flex gap-2">
              <Button autoInsertSpace={false} htmlType="button" className="h-auto flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 shadow-none" onClick={() => onOpenDetail(row, 'revenue')}>净实收明细</Button>
              <Button autoInsertSpace={false} htmlType="button" className="h-auto flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 shadow-none" onClick={() => onOpenDetail(row, 'labor')}>工时明细</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function LaborSection({ show }: { show: (m: string) => void }) {
  const isMobile = useIsMobile();
  const [granularity, setGranularity] = useState<TrendGranularity>('week');
  const [trendRange, setTrendRange] = useState(() => defaultTrendRange('week', beijingTodayYmd()));
  const { dateFrom, dateTo, includeCurrent } = trendRange;
  const historyDateFrom = useMemo(
    () => trendHistoryStart(granularity, dateFrom),
    [dateFrom, granularity],
  );
  const [scopeKeys, setScopeKeys] = useState<string[]>(['ALL']);
  const [scopeTree, setScopeTree] = useState<StoreScopeNode[]>([]);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('previous');
  const [comparisonDisplayMode, setComparisonDisplayMode] = useState<ComparisonDisplayMode>('percentage');
  const [detailPeriodKey, setDetailPeriodKey] = useState('');
  const [comparisonData, setComparisonData] = useState<Awaited<ReturnType<typeof fetchOperationsLabor>> | null>(null);
  const [display, setDisplay] = useState<LaborDisplaySnapshot | null>(null);
  const [detailDisplay, setDetailDisplay] = useState<LaborDetailSnapshot | null>(null);
  const [laborFacts, setLaborFacts] = useState<LaborDailyFact[]>([]);
  const [laborFactMode, setLaborFactMode] = useState<LaborDailyFactMode>('loading');
  const [laborFactRefreshSeq, setLaborFactRefreshSeq] = useState(0);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [detailMode, setDetailMode] = useState<LaborDetailMode>('labor');
  const [detailRow, setDetailRow] = useState<LaborRow | null>(null);
  const [detail, setDetail] = useState<LaborEfficiencyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [fullscreenFilterExpanded, setFullscreenFilterExpanded] = useState(false);
  const loadSeqRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const summaryLoadSeqRef = useRef(0);
  const summaryLoadAbortRef = useRef<AbortController | null>(null);
  const laborFactAbortRef = useRef<AbortController | null>(null);
  const laborFactRefreshConsumedRef = useRef(0);
  const { fullscreenChart, fullscreenPortrait, openFullscreen, closeFullscreen } = useAnalyticsChartFullscreen<'labor-hours' | 'labor-efficiency'>();
  const scopeSelection = useMemo(
    () => resolveStoreScopeSelection(scopeKeys, scopeTree),
    [scopeKeys, scopeTree],
  );
  const departmentKeys = [...new Set(scopeSelection.departmentKeys)];
  const hasUnresolvedDepartmentScope = !scopeKeys.includes('ALL') && departmentKeys.length === 0;
  const hasOnlyDuplicateLeafDepartments = scopeSelection.scopes.length > 1
    && scopeSelection.scopes.every(scope => scope.departmentKeys?.length === 1)
    && new Set(scopeSelection.scopes.map(scope => scope.departmentKeys?.[0])).size < scopeSelection.scopes.length;
  const isComparison = scopeSelection.scopes.length > 1
    && departmentKeys.length > 0
    && !hasOnlyDuplicateLeafDepartments;
  const scopeLabels = useMemo(
    () => Object.fromEntries(scopeSelection.scopes.map(scope => [scope.key, scope.label])),
    [scopeSelection.scopes],
  );
  const detailPeriodOptions = useMemo(
    () => buildDetailPeriodOptions(granularity, dateFrom, dateTo),
    [dateFrom, dateTo, granularity],
  );
  const localDetailPeriodKeys = useMemo(() => {
    if (laborFactMode !== 'ready') return new Set<string>();
    return new Set(groupDailyFacts<LaborDailyFact>(
      usableLaborFacts(laborFacts),
      granularity,
      includeCurrent,
      dateFrom,
      dateTo,
    ).map(period => period.dateFrom));
  }, [dateFrom, dateTo, granularity, includeCurrent, laborFactMode, laborFacts]);
  const selectedDetailPeriod = useMemo(
    () => detailPeriodOptions.find(option => option.key === detailPeriodKey)
      ?? [...detailPeriodOptions].reverse().find(option => localDetailPeriodKeys.has(option.key))
      ?? detailPeriodOptions[detailPeriodOptions.length - 1],
    [detailPeriodKey, detailPeriodOptions, localDetailPeriodKeys],
  );

  const loadTrend = (refresh = false) => {
    if (hasUnresolvedDepartmentScope) return;
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);
    const requestDepartmentKeys = scopeKeys.includes('ALL') ? undefined : departmentKeys;
    getLaborEfficiencyTrend(dateFrom, dateTo, 'ALL', 30, {
      signal: controller.signal,
      forceRefresh: refresh,
      granularity,
      includeCurrent,
      includeStoreTrends: isComparison,
      storeKeys: requestDepartmentKeys,
    })
      .then(trend => {
        if (seq !== loadSeqRef.current) return;
        setDisplay({
          trend,
          granularity,
          includeCurrent,
          dateFrom,
          dateTo,
          departmentKeys: [...departmentKeys],
          scopes: [...scopeSelection.scopes],
          compareStores: isComparison,
          storeLabel: scopeSelection.label,
          storeLabels: scopeLabels,
        });
      })
      .catch(e => {
        if (seq !== loadSeqRef.current || isAbortError(e)) return;
        show((e as Error).message);
      })
      .finally(() => {
        if (seq === loadSeqRef.current) setLoading(false);
      });
  };

  const loadSummary = (refresh = false) => {
    if (hasUnresolvedDepartmentScope || !selectedDetailPeriod) return;
    const seq = summaryLoadSeqRef.current + 1;
    summaryLoadSeqRef.current = seq;
    summaryLoadAbortRef.current?.abort();
    const controller = new AbortController();
    summaryLoadAbortRef.current = controller;
    setSummaryLoading(true);
    setDetailDisplay(null);
    setComparisonData(null);
    const requestDepartmentKeys = scopeKeys.includes('ALL') ? undefined : departmentKeys;
    const comparisonRequest = comparisonMode === 'previous'
      ? fetchOperationsLabor({
          filters: {
            scopeKeys,
            storeKeys: requestDepartmentKeys || [],
            channel: 'all',
            granularity,
            dateFrom: selectedDetailPeriod.dateFrom,
            dateTo: selectedDetailPeriod.dateTo,
            compare: comparisonMode,
          },
          signal: controller.signal,
        }).catch(() => null)
      : Promise.resolve(null);
    Promise.all([
      getLaborEfficiency(selectedDetailPeriod.dateFrom, selectedDetailPeriod.dateTo, refresh, {
        signal: controller.signal,
        storeKeys: requestDepartmentKeys,
      }),
      comparisonRequest,
    ])
      .then(([res, comparison]) => {
        if (seq !== summaryLoadSeqRef.current) return;
        setComparisonData(comparison);
        setDetailDisplay({
          rows: res.rows,
          dateFrom: selectedDetailPeriod.dateFrom,
          dateTo: selectedDetailPeriod.dateTo,
          departmentKeys: [...departmentKeys],
        });
        if (refresh) show(res.refresh_queued ? '已提交人效后台刷新，稍后自动读取最新快照' : '已重新加载人效数据');
      })
      .catch(e => {
        if (seq !== summaryLoadSeqRef.current || isAbortError(e)) return;
        show((e as Error).message);
      })
      .finally(() => {
        if (seq === summaryLoadSeqRef.current) setSummaryLoading(false);
      });
  };
  useEffect(() => {
    const controller = new AbortController();
    laborFactAbortRef.current?.abort();
    laborFactAbortRef.current = controller;
    const forceRefresh = laborFactRefreshSeq > laborFactRefreshConsumedRef.current;
    if (forceRefresh) laborFactRefreshConsumedRef.current = laborFactRefreshSeq;
    setLaborFactMode('loading');
    getLaborDailyFacts<LaborDailyFact>(historyDateFrom, dateTo, {}, {
      signal: controller.signal,
      forceRefresh,
    })
      .then((records: DailyFactRecord<LaborDailyFact>[]) => {
        if (controller.signal.aborted) return;
        setLaborFacts(records.map(laborFactFromRecord));
        setLaborFactMode('ready');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLaborFacts([]);
        setLaborFactMode('fallback');
        if (forceRefresh) {
          show(error instanceof Error ? error.message : String(error));
        }
      });
    return () => controller.abort();
    /* eslint-disable-next-line */
  }, [dateTo, historyDateFrom, laborFactRefreshSeq]);

  useEffect(() => {
    if (hasUnresolvedDepartmentScope) {
      loadSeqRef.current += 1;
      loadAbortRef.current?.abort();
      setLoading(false);
      setDisplay(null);
      return;
    }
    if (laborFactMode === 'loading') return;
    if (laborFactMode === 'ready') {
      loadSeqRef.current += 1;
      loadAbortRef.current?.abort();
      setLoading(false);
      setDisplay({
        trend: laborTrendFromFacts(
          laborFacts,
          granularity,
          includeCurrent,
          departmentKeys,
          isComparison,
          historyDateFrom,
          dateTo,
          dateFrom,
          dateTo,
        ),
        granularity,
        includeCurrent,
        dateFrom,
        dateTo,
        departmentKeys: [...departmentKeys],
        scopes: [...scopeSelection.scopes],
        compareStores: isComparison,
        storeLabel: scopeSelection.label,
        storeLabels: scopeLabels,
      });
      return;
    }
    loadTrend();
    return () => loadAbortRef.current?.abort();
    /* eslint-disable-next-line */
  }, [dateFrom, dateTo, granularity, historyDateFrom, includeCurrent, scopeKeys.join(','), departmentKeys.join(','), isComparison, laborFactMode, laborFacts]);
  useEffect(() => {
    if (
      laborFactMode === 'ready'
      && localDetailPeriodKeys.size > 0
      && detailPeriodKey
      && !localDetailPeriodKeys.has(detailPeriodKey)
    ) {
      const latestLocal = [...detailPeriodOptions].reverse().find(option => localDetailPeriodKeys.has(option.key));
      if (latestLocal) {
        setDetailPeriodKey(latestLocal.key);
        return;
      }
    }
    if (selectedDetailPeriod && detailPeriodKey !== selectedDetailPeriod.key) {
      setDetailPeriodKey(selectedDetailPeriod.key);
    }
  }, [detailPeriodKey, detailPeriodOptions, laborFactMode, localDetailPeriodKeys, selectedDetailPeriod]);
  useEffect(() => {
    if (hasUnresolvedDepartmentScope) {
      summaryLoadSeqRef.current += 1;
      summaryLoadAbortRef.current?.abort();
      setSummaryLoading(false);
      setDetailDisplay(null);
      setComparisonData(null);
      return;
    }
    if (laborFactMode === 'loading') return;
    if (laborFactMode === 'ready') {
      const seq = summaryLoadSeqRef.current + 1;
      summaryLoadSeqRef.current = seq;
      summaryLoadAbortRef.current?.abort();
      const controller = new AbortController();
      summaryLoadAbortRef.current = controller;
      setSummaryLoading(true);
      const localDetail = laborDetailFromFacts(
        laborFacts,
        selectedDetailPeriod.dateFrom,
        selectedDetailPeriod.dateTo,
        departmentKeys,
      );
      setDetailDisplay(localDetail);
      setComparisonData(null);
      const requestDepartmentKeys = scopeKeys.includes('ALL') ? undefined : departmentKeys;
      const comparisonRequest = comparisonMode === 'previous'
        ? fetchOperationsLabor({
            filters: {
              scopeKeys,
              storeKeys: requestDepartmentKeys || [],
              channel: 'all',
              granularity,
              dateFrom: selectedDetailPeriod.dateFrom,
              dateTo: selectedDetailPeriod.dateTo,
              compare: comparisonMode,
            },
            signal: controller.signal,
          }).catch(() => null)
        : Promise.resolve(null);
      const headcountRequest = getLaborEfficiency(
        selectedDetailPeriod.dateFrom,
        selectedDetailPeriod.dateTo,
        false,
        { signal: controller.signal, storeKeys: requestDepartmentKeys },
      ).catch(error => {
        if (isAbortError(error)) throw error;
        return null;
      });
      Promise.all([headcountRequest, comparisonRequest])
        .then(([summary, comparison]) => {
          if (seq !== summaryLoadSeqRef.current) return;
          if (summary) {
            setDetailDisplay({
              ...localDetail,
              rows: mergeLaborHeadcount(localDetail.rows, summary.rows),
            });
          }
          setComparisonData(comparison);
        })
        .finally(() => {
          if (seq === summaryLoadSeqRef.current) setSummaryLoading(false);
        });
      return () => controller.abort();
    }
    loadSummary();
    return () => summaryLoadAbortRef.current?.abort();
    /* eslint-disable-next-line */
  }, [selectedDetailPeriod?.dateFrom, selectedDetailPeriod?.dateTo, granularity, comparisonMode, scopeKeys.join(','), departmentKeys.join(','), laborFactMode, laborFacts]);
  useEffect(() => {
    listStoreScopeTree().then(result => setScopeTree(result.nodes || [])).catch(e => show((e as Error).message));
    /* eslint-disable-next-line */
  }, []);
  useEffect(() => {
    if (!fullscreenChart) setFullscreenFilterExpanded(false);
  }, [fullscreenChart]);

  const openDetail = (row: LaborRow, mode: LaborDetailMode) => {
    setDetailMode(mode);
    setDetailRow(row);
    setDetail(null);
    setDetailLoading(true);
    getLaborEfficiencyDetail(detailDisplay?.dateFrom || dateFrom, detailDisplay?.dateTo || dateTo, row.store_key)
      .then(setDetail)
      .catch(e => { show((e as Error).message); setDetailRow(null); })
      .finally(() => setDetailLoading(false));
  };
  const handleGranularityChange = (next: TrendGranularity) => {
    setGranularity(next);
    setTrendRange(defaultTrendRange(next, beijingTodayYmd()));
  };
  const handleRangeChange = (nextFrom: string, nextTo: string) => {
    setTrendRange(current => ({ ...current, dateFrom: nextFrom, dateTo: nextTo }));
  };
  const refresh = () => {
    if (laborFactMode === 'ready') {
      setLaborFactRefreshSeq(value => value + 1);
      return;
    }
    loadTrend(true);
    loadSummary(true);
  };

  const rows = detailDisplay?.rows || [];
  const covered = rows.filter(r => !r.uncovered);
  const selectedRows = detailDisplay?.departmentKeys.length
    ? covered.filter(r => detailDisplay.departmentKeys.includes(r.store_key))
    : covered;
  const rankedRows = selectedRows.filter(r => Number(r.net_revenue || 0) > 0);
  const nonStoreRows = selectedRows.filter(r => Number(r.net_revenue || 0) <= 0 && Number(r.actual_hours || 0) > 0);
  const uncoveredRows = detailDisplay?.departmentKeys.length ? [] : rows.filter(r => r.uncovered && r.net_revenue > 0);
  const laborRows = [...rankedRows, ...uncoveredRows];
  const trendPoints = visibleLaborTrendPoints(display?.trend.points || []);
  const trendFallbackRows = selectedRows;
  const summaryNet = comparisonData?.summary.net_revenue
    ?? sumMoney(trendFallbackRows.map(row => row.net_revenue));
  const summaryActual = comparisonData?.summary.actual_hours
    ?? trendFallbackRows.reduce((sum, row) => sum + Number(row.actual_hours || 0), 0);
  const summaryPlanned = comparisonData?.summary.planned_hours
    ?? trendFallbackRows.reduce((sum, row) => sum + Number(row.planned_hours || 0), 0);
  const summaryActualEfficiency = comparisonData?.summary.actual_revenue_per_hour
    ?? (summaryActual ? summaryNet / summaryActual : 0);
  const summaryPlannedEfficiency = comparisonData?.summary.planned_revenue_per_hour
    ?? (summaryPlanned ? summaryNet / summaryPlanned : 0);
  const trendStoreLabel = display?.storeLabel || scopeSelection.label;
  const comparisonTrends = display?.compareStores
    ? buildLaborScopeTrendSeries(display.scopes, display.trend.store_trends || {})
    : undefined;
  const movingAverages = display?.trend.moving_averages || [];
  const availableMovingAverageLabel = [...new Set(movingAverages
    .filter(item => item.available)
    .map(item => `MA${item.window}`))]
    .join(' / ');
  const movingAverageStatus = (metric: 'hours' | 'efficiency'): TrendMovingAverageMeta[] => {
    const fields = metric === 'hours'
      ? [['actual_hours_', '实际'], ['planned_hours_', '排班']]
      : [['actual_revenue_per_hour_', '实际'], ['planned_revenue_per_hour_', '排班']];
    return movingAverages.flatMap(item => {
      const field = fields.find(([prefix]) => item.field.startsWith(prefix));
      return field ? [{ ...item, label: `${field[1]} MA${item.window}` }] : [];
    });
  };
  const renderControls = (mobile = false, fullscreen = false) => (
    <>
      <div className={mobile ? 'w-full' : 'w-[260px] min-w-[220px]'}>
        <StoreScopePicker
          nodes={scopeTree}
          value={scopeKeys}
          onChange={setScopeKeys}
          fullscreen={fullscreen}
          ariaLabel={fullscreen ? '人效全屏门店范围' : '人效门店范围'}
        />
      </div>
      <div className={mobile ? 'w-full' : 'min-w-[20rem] flex-1'}>
        <TrendPeriodControls
          granularity={granularity}
          dateFrom={dateFrom}
          dateTo={dateTo}
          includeCurrent={includeCurrent}
          onGranularityChange={handleGranularityChange}
          onRangeChange={handleRangeChange}
          onIncludeCurrentChange={value => setTrendRange(current => ({ ...current, includeCurrent: value }))}
          fullscreen={fullscreen}
        />
      </div>
      <ComparisonModeSelect
        ariaLabel={mobile ? '人效移动端对比方式' : '人效对比方式'}
        value={comparisonMode}
        onChange={setComparisonMode}
        mobile={mobile}
      />
      <Button autoInsertSpace={false} htmlType="button" className={`h-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer ${mobile ? 'w-full' : 'ml-auto'}`} disabled={loading || summaryLoading || hasUnresolvedDepartmentScope} onClick={refresh}>{loading || summaryLoading ? '刷新中…' : '刷新'}</Button>
    </>
  );
  const laborColumns: TableColumnsType<LaborRow> = [
    {
      title: '门店',
      dataIndex: 'store_label',
      key: 'store_label',
      render: (value, r) => <span className={r.uncovered ? 'text-amber-700' : 'text-slate-700'}>{r.uncovered ? `⚠ ${value}` : String(value || '-')}</span>,
    },
    {
      title: '净实收',
      dataIndex: 'net_revenue',
      key: 'net_revenue',
      align: 'right',
      render: (value, r) => r.uncovered ? (
        <span className="text-amber-700">{yuan(Number(value))}</span>
      ) : (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <span className="text-slate-600">{yuan(Number(value))}</span>
          <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer" onClick={() => openDetail(r, 'revenue')}>明细</Button>
        </div>
      ),
    },
    {
      title: '排班工时',
      dataIndex: 'planned_hours',
      key: 'planned_hours',
      align: 'right',
      render: (value) => <span className="text-slate-600">{Number(value).toFixed(1)}</span>,
    },
    {
      title: '实际工时',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      align: 'right',
      render: (value, r) => r.uncovered ? (
        <span className="text-slate-400">{Number(value || 0).toFixed(1)}</span>
      ) : (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <span className="text-slate-600">{Number(value).toFixed(1)}</span>
          <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer" onClick={() => openDetail(r, 'labor')}>工时</Button>
        </div>
      ),
    },
    {
      title: '实际人效(元/时)',
      dataIndex: 'revenue_per_hour',
      key: 'revenue_per_hour',
      align: 'right',
      render: (value) => <span className="font-medium text-slate-800">{value ? yuan(Number(value)) : '—'}</span>,
    },
    {
      title: '排班人效(元/时)',
      key: 'planned_revenue_per_hour',
      align: 'right',
      render: (_, r) => {
        const planned = Number(r.planned_hours || 0);
        return <span className="font-medium text-slate-800">{planned ? yuan(Number(r.net_revenue || 0) / planned) : '—'}</span>;
      },
    },
    {
      title: '人数',
      dataIndex: 'headcount',
      key: 'headcount',
      align: 'right',
      render: (value) => <span className="text-slate-600">{String(value)}</span>,
    },
    {
      title: '排班缺口(时)',
      dataIndex: 'hours_gap',
      key: 'hours_gap',
      align: 'right',
      render: (value) => <span className="text-slate-500">{Number(value).toFixed(1)}</span>,
    },
  ];
  return (
    <Card>
      <MobileInlineFilter
        summary={`${scopeSelection.label} · ${dateFrom.slice(5)} 至 ${dateTo.slice(5)}`}
        open={filterExpanded}
        onToggle={() => setFilterExpanded(v => !v)}
      >
          {renderControls(true)}
      </MobileInlineFilter>
      <div className="mb-4 hidden flex-wrap items-center gap-2 md:flex">
        {renderControls(false)}
      </div>
      <p className="text-xs text-slate-400 mb-3">人效 = 门店净实收 ÷ 实际工时（元/工时）。仅统计已确认店铺映射的直营经营门店。</p>
      {hasUnresolvedDepartmentScope ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          当前门店范围未解析到人事部门，请检查门店映射。
        </div>
      ) : null}
      <div data-testid="labor-period-summary" className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 md:p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-slate-500">统计周期</div>
            <div className="mt-1 text-base font-semibold text-slate-900">{selectedDetailPeriod?.label || '暂无'}</div>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <span className="shrink-0 text-xs text-slate-500">对比展示</span>
            <ComparisonDisplaySelect
              ariaLabel="人效对比展示"
              value={comparisonDisplayMode}
              onChange={setComparisonDisplayMode}
              disabled={comparisonMode !== 'previous'}
            />
            <DetailPeriodSelect
              options={detailPeriodOptions}
              value={selectedDetailPeriod?.key}
              onChange={setDetailPeriodKey}
              label="切换周期"
              ariaLabel="人效数据周期"
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <Metric label="净实收" value={compactYuan(summaryNet)} comparison={comparisonData?.summary.comparison?.net_revenue} format="money" displayMode={comparisonDisplayMode} />
          <Metric label="排班工时" value={summaryPlanned.toFixed(1)} comparison={comparisonData?.summary.comparison?.planned_hours} format="hours" displayMode={comparisonDisplayMode} />
          <Metric label="实际工时" value={summaryActual.toFixed(1)} comparison={comparisonData?.summary.comparison?.actual_hours} format="hours" displayMode={comparisonDisplayMode} />
          <Metric label="实际人效" value={summaryActualEfficiency ? yuan(summaryActualEfficiency) : '—'} comparison={comparisonData?.summary.comparison?.actual_revenue_per_hour} format="moneyPerHour" displayMode={comparisonDisplayMode} />
          <Metric label="排班人效" value={summaryPlannedEfficiency ? yuan(summaryPlannedEfficiency) : '—'} comparison={comparisonData?.summary.comparison?.planned_revenue_per_hour} format="moneyPerHour" displayMode={comparisonDisplayMode} />
        </div>
        <ComparisonPeriodNote previousPeriod={comparisonData?.previous_period} />
      </div>
      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-2">
            <div className="text-sm font-medium text-slate-800">工时趋势</div>
            <div className="mt-1 text-xs text-slate-400">{display?.compareStores ? '实际 / 排班 · 已选范围对比' : `实际 / 排班 · ${availableMovingAverageLabel || '工时'}`}</div>
            {display && !display.compareStores ? <MovingAverageStatus items={movingAverageStatus('hours')} /> : null}
          </div>
          {display && trendPoints.length > 0 ? (
            <div className="relative">
              <Suspense fallback={<div className="flex h-[20rem] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">图表加载中…</div>}>
                <LaborTrendChart
                  points={trendPoints}
                  metric="hours"
                  storeTrends={comparisonTrends}
                  storeLabels={display.storeLabels}
                  granularity={display.granularity}
                  movingAverages={movingAverages}
                  onFullscreen={() => openFullscreen('labor-hours')}
                />
              </Suspense>
              {loading ? <div aria-label="人效趋势数据更新中" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 text-sm text-slate-500">更新中…</div> : null}
            </div>
          ) : loading ? (
            <div className="flex h-[20rem] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">加载中…</div>
          ) : (
            <div className="flex h-[20rem] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">暂无趋势数据</div>
          )}
        </div>
        <div>
          <div className="mb-2">
            <div className="text-sm font-medium text-slate-800">人效趋势</div>
            <div className="mt-1 text-xs text-slate-400">{display?.compareStores ? '实际人效 / 排班人效 · 已选范围对比' : `实际人效 / 排班人效 · ${availableMovingAverageLabel || '元/工时'}`}</div>
            {display && !display.compareStores ? <MovingAverageStatus items={movingAverageStatus('efficiency')} /> : null}
          </div>
          {display && trendPoints.length > 0 ? (
            <div className="relative">
              <Suspense fallback={<div className="flex h-[20rem] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">图表加载中…</div>}>
                <LaborTrendChart
                  points={trendPoints}
                  metric="efficiency"
                  storeTrends={comparisonTrends}
                  storeLabels={display.storeLabels}
                  granularity={display.granularity}
                  movingAverages={movingAverages}
                  onFullscreen={() => openFullscreen('labor-efficiency')}
                />
              </Suspense>
              {loading ? <div aria-label="人效趋势数据更新中" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 text-sm text-slate-500">更新中…</div> : null}
            </div>
          ) : loading ? (
            <div className="flex h-[20rem] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">加载中…</div>
          ) : (
            <div className="flex h-[20rem] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">暂无趋势数据</div>
          )}
        </div>
      </div>
      {fullscreenChart ? (
        <ChartFullscreenLayer
          title={fullscreenChart === 'labor-hours' ? '工时趋势' : '人效趋势'}
          subtitle={`${trendStoreLabel} · ${(display?.dateFrom || dateFrom).slice(5)} 至 ${(display?.dateTo || dateTo).slice(5)}`}
          showRotateHint={fullscreenPortrait}
          controls={(
            <div className="relative">
              <FullscreenFilterButton
                expanded={fullscreenFilterExpanded}
                onClick={() => setFullscreenFilterExpanded(v => !v)}
              />
              {fullscreenFilterExpanded ? (
                <div className="chart-fullscreen-filter-panel">
                  <div className="mb-1.5 truncate text-[11px] text-slate-400">{scopeSelection.label} · {dateFrom.slice(5)} 至 {dateTo.slice(5)}</div>
                  <div className="space-y-2">{renderControls(true, true)}</div>
                </div>
              ) : null}
            </div>
          )}
          onClose={closeFullscreen}
        >
          {display && trendPoints.length > 0 ? (
            <div className="relative h-full min-h-0">
              <Suspense fallback={<div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">图表加载中…</div>}>
                <LaborTrendChart
                  points={trendPoints}
                  metric={fullscreenChart === 'labor-hours' ? 'hours' : 'efficiency'}
                  storeTrends={comparisonTrends}
                  storeLabels={display.storeLabels}
                  granularity={display.granularity}
                  movingAverages={movingAverages}
                  fullscreen
                />
              </Suspense>
              {loading ? <div aria-label="全屏人效趋势数据更新中" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 text-sm text-slate-500">更新中…</div> : null}
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">加载中...</div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">暂无趋势数据</div>
          )}
        </ChartFullscreenLayer>
      ) : null}
      {rows.length === 0 ? <div className="text-slate-400 text-sm py-8 text-center">{summaryLoading ? '加载中…' : hasUnresolvedDepartmentScope ? '当前范围无可用部门' : '该周期暂无数据'}</div> : (
        <div className={isMobile ? '' : 'overflow-x-auto'}>
          {isMobile ? (
            <LaborMobileCards rows={laborRows} onOpenDetail={openDetail} />
          ) : (
            <Table<LaborRow>
              columns={laborColumns}
              dataSource={laborRows}
              pagination={false}
              rowClassName={(r) => r.uncovered ? 'bg-amber-50/50' : ''}
              rowKey="store_key"
              size="small"
              scroll={{ x: 'max-content' }}
            />
          )}
          {nonStoreRows.length > 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <div className="font-medium text-slate-600">未进入门店人效排名</div>
              <div className="mt-1">
                {nonStoreRows.slice(0, 8).map(r => `${r.store_label || r.store_key}（工时 ${r.actual_hours.toFixed(1)}）`).join('、')}
                {nonStoreRows.length > 8 ? ` 等 ${nonStoreRows.length} 项` : ''}
              </div>
              <div className="mt-1 text-slate-400">这些记录当前净实收为 0，只作为工时覆盖检查，不参与门店人效排名。</div>
            </div>
          )}
        </div>
      )}
      {detailRow && (
        <LaborDetailModal
          mode={detailMode}
          row={detailRow}
          detail={detail}
          loading={detailLoading}
          onModeChange={setDetailMode}
          onClose={() => setDetailRow(null)}
        />
      )}
    </Card>
  );
}

type LaborRevenueDailyRow = LaborEfficiencyDetail['revenue']['daily'][number];
type LaborRevenueShopRow = LaborEfficiencyDetail['revenue']['shops'][number];
type LaborEmployeeRow = LaborEfficiencyDetail['labor']['employees'][number];

function LaborDetailModal({
  mode,
  row,
  detail,
  loading,
  onModeChange,
  onClose,
}: {
  mode: LaborDetailMode;
  row: LaborRow;
  detail: LaborEfficiencyDetail | null;
  loading: boolean;
  onModeChange: (mode: LaborDetailMode) => void;
  onClose: () => void;
}) {
  const labor = detail?.labor;
  const revenue = detail?.revenue;
  const revenueDailyColumns: TableColumnsType<LaborRevenueDailyRow> = [
    { title: '日期', dataIndex: 'business_date', key: 'business_date', render: (value) => <span className="text-slate-700">{String(value)}</span> },
    { title: '订单数', dataIndex: 'order_count', key: 'order_count', align: 'right', render: (value) => <span className="text-slate-600">{String(value)}</span> },
    { title: '用户实付', dataIndex: 'paid_amount', key: 'paid_amount', align: 'right', render: (value) => <span className="text-slate-600">{yuan(Number(value))}</span> },
    { title: '商家实收', dataIndex: 'income_amount', key: 'income_amount', align: 'right', render: (value) => <span className="text-slate-600">{yuan(Number(value))}</span> },
    { title: '退款', dataIndex: 'refund_amount', key: 'refund_amount', align: 'right', render: (value) => <span className="text-slate-600">{yuan(Number(value))}</span> },
    { title: '净实收', dataIndex: 'net_income', key: 'net_income', align: 'right', render: (value) => <span className="font-medium text-slate-800">{yuan(Number(value))}</span> },
  ];
  const revenueShopColumns: TableColumnsType<LaborRevenueShopRow> = [
    { title: '食亨店铺', dataIndex: 'shop_name', key: 'shop_name', render: (value) => <span className="text-slate-700">{String(value || '-')}</span> },
    { title: '订单数', dataIndex: 'order_count', key: 'order_count', align: 'right', render: (value) => <span className="text-slate-600">{String(value)}</span> },
    { title: '用户实付', dataIndex: 'paid_amount', key: 'paid_amount', align: 'right', render: (value) => <span className="text-slate-600">{yuan(Number(value))}</span> },
    { title: '商家实收', dataIndex: 'income_amount', key: 'income_amount', align: 'right', render: (value) => <span className="text-slate-600">{yuan(Number(value))}</span> },
    { title: '退款', dataIndex: 'refund_amount', key: 'refund_amount', align: 'right', render: (value) => <span className="text-slate-600">{yuan(Number(value))}</span> },
    { title: '净实收', dataIndex: 'net_income', key: 'net_income', align: 'right', render: (value) => <span className="font-medium text-slate-800">{yuan(Number(value))}</span> },
  ];
  const laborEmployeeColumns: TableColumnsType<LaborEmployeeRow> = [
    { title: '员工', dataIndex: 'name', key: 'name', render: (value) => <span className="text-slate-700">{String(value || '-')}</span> },
    { title: '人员类型', dataIndex: 'support_type', key: 'support_type', render: (value) => {
      const text = String(value || '本店员工');
      const isSupport = text === '外店支援';
      return <span className={isSupport ? 'font-medium text-amber-700' : 'text-slate-500'}>{text}</span>;
    } },
    { title: '主部门', dataIndex: 'home_department', key: 'home_department', render: (value) => <span className="text-slate-500">{String(value || '-')}</span> },
    { title: '支援时长', key: 'support_hours', align: 'right', render: (_, r) => {
      const planned = Number(r.support_planned_hours ?? r.support_hours ?? 0);
      const actual = Number(r.support_actual_hours ?? 0);
      return planned > 0 || actual > 0
        ? <span className="text-amber-700">排 {planned.toFixed(1)} / 实 {actual.toFixed(1)}</span>
        : <span className="text-slate-400">-</span>;
    } },
    { title: '排班工时', dataIndex: 'planned_hours', key: 'planned_hours', align: 'right', render: (value) => <span className="text-slate-600">{Number(value).toFixed(1)}</span> },
    { title: '实际工时', dataIndex: 'actual_hours', key: 'actual_hours', align: 'right', render: (value) => <span className="text-slate-600">{Number(value).toFixed(1)}</span> },
    { title: '加班工时', key: 'overtime_hours', align: 'right', render: (_, r) => <span className="text-slate-600">{Math.max(Number(r.actual_hours || 0) - Number(r.planned_hours || 0), 0).toFixed(1)}</span> },
    { title: '缺卡工时', key: 'missing_hours', align: 'right', render: (_, r) => <span className="text-slate-600">{Math.max(Number(r.planned_hours || 0) - Number(r.actual_hours || 0), 0).toFixed(1)}</span> },
    { title: '班段', dataIndex: 'segment_count', key: 'segment_count', align: 'right', render: (value) => <span className="text-slate-600">{String(value)}</span> },
    { title: '缺卡', dataIndex: 'missing_count', key: 'missing_count', align: 'right', render: (value) => <span className="text-slate-600">{String(value)}</span> },
    { title: '异常', dataIndex: 'anomaly_count', key: 'anomaly_count', align: 'right', render: (value) => <span className="text-slate-600">{String(value)}</span> },
  ];
  return (
    <Modal open centered footer={null} closable={false} width="52rem" onCancel={onClose} styles={{ body: { padding: 0 } }}>
      <div className="max-h-[82vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-medium text-slate-800">{detail?.store_label || row.store_label || row.store_key}</h3>
            <p className="mt-1 text-xs text-slate-400">人效明细 · {detail?.period || '当前周期'}</p>
          </div>
          <Button autoInsertSpace={false} htmlType="button" className="h-auto rounded-md border-0 px-2 py-1 text-sm text-slate-400 shadow-none hover:bg-slate-100 hover:text-slate-600 cursor-pointer" onClick={onClose}>关闭</Button>
        </div>
        <div className="flex gap-1 border-b border-slate-100 px-5 py-3">
          <Button autoInsertSpace={false} htmlType="button" onClick={() => onModeChange('revenue')}
            className={`h-auto rounded-md border-0 px-3 py-1.5 text-sm shadow-none cursor-pointer ${mode === 'revenue' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}>
            净实收明细
          </Button>
          <Button autoInsertSpace={false} htmlType="button" onClick={() => onModeChange('labor')}
            className={`h-auto rounded-md border-0 px-3 py-1.5 text-sm shadow-none cursor-pointer ${mode === 'labor' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}>
            工时明细
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">加载明细中…</div>
          ) : mode === 'revenue' && revenue ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <Metric label="订单数" value={String(revenue.order_count)} />
                <Metric label="用户实付" value={yuan(revenue.paid_amount)} />
                <Metric label="商家实收" value={yuan(revenue.income_amount)} />
                <Metric label="退款" value={yuan(revenue.refund_amount)} />
                <Metric label="净实收" value={yuan(revenue.net_income)} />
              </div>
              {(revenue.daily || []).length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-slate-500">按日明细</div>
                  <Table<LaborRevenueDailyRow>
                    columns={revenueDailyColumns}
                    dataSource={revenue.daily}
                    pagination={false}
                    rowKey="business_date"
                    size="small"
                    scroll={{ x: 'max-content' }}
                  />
                </div>
              )}
              {revenue.shops.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">该门店暂无订单输入</div>
              ) : (
                <div>
                  <div className="mb-2 text-xs font-medium text-slate-500">食亨店铺汇总</div>
                  <Table<LaborRevenueShopRow>
                    columns={revenueShopColumns}
                    dataSource={revenue.shops}
                    pagination={false}
                    rowKey="shop_id"
                    size="small"
                    scroll={{ x: 'max-content' }}
                  />
                </div>
              )}
            </div>
          ) : mode === 'labor' && labor ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <Metric label="排班工时" value={labor.planned_hours.toFixed(1)} />
                <Metric label="实际工时" value={labor.actual_hours.toFixed(1)} />
                <Metric label="加班工时" value={Math.max(labor.actual_hours - labor.planned_hours, 0).toFixed(1)} />
                <Metric label="缺卡工时" value={Math.max(labor.planned_hours - labor.actual_hours, 0).toFixed(1)} />
                <Metric label="人数" value={String(labor.headcount)} />
              </div>
              {labor.employees.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">该门店暂无员工工时明细</div>
              ) : (
                <Table<LaborEmployeeRow>
                  columns={laborEmployeeColumns}
                  dataSource={labor.employees}
                  pagination={false}
                  rowKey="user_id"
                  size="small"
                  scroll={{ x: 'max-content' }}
                />
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-400">暂无明细</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Metric({
  label,
  value,
  comparison,
  format,
  displayMode,
}: {
  label: string;
  value: string;
  comparison?: MetricComparison | null;
  format?: ComparisonValueFormat;
  displayMode?: ComparisonDisplayMode;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 font-medium text-slate-800">{value}</div>
      {comparison ? (
        <PeriodComparisonText comparison={comparison} format={format} displayMode={displayMode} className="mt-1 block text-[11px] tabular-nums" />
      ) : null}
    </div>
  );
}
