import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Select, Table, type TableColumnsType } from 'antd';
import { getProducts, getProductTrend, listPlatformDim, listStoreScopeTree, type AnalyticsCacheMeta, type PlatformDim, type ProductRow, type ProductTrendPoint, type ProductTrendResult } from '../../api/analytics';
import {
  fetchOperationsProducts,
  type ComparisonMode,
  type MetricComparison,
} from '../../features/operations-analysis/api/client';
import {
  TableDisplayFrame,
  type TableDisplayCell,
  type TableDisplayData,
  type TableDisplayValue,
} from '../TableDisplayFrame';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ChartFullscreenLayer, FullscreenFilterButton, useAnalyticsChartFullscreen } from './ChartFullscreen';
import { DetailPeriodSelect } from './DetailPeriodSelect';
import {
  ComparisonDisplaySelect,
  ComparisonModeSelect,
  ComparisonPeriodNote,
  PeriodComparisonRate,
  comparisonDisplayItems,
  type ComparisonDisplayMode,
  type ComparisonValueFormat,
} from './PeriodComparison';
import {
  Card, MobileField, MobileInlineFilter, inputCls, isAbortError, searchableSelectProps, yuan,
} from './shared';
import { getProductDailyFacts } from '../../api/analyticsDailyFacts';
import type { DailyFactRecord } from '../../api/analyticsDailyTypes';
import { completenessIsReady, completenessStatus } from './completeness';
import { MovingAverageStatus } from './MovingAverageStatus';
import { buildScopeProductTrendSeries } from './scopeTrendSeries';
import { StoreScopePicker } from './StoreScopePicker';
import { resolveStoreScopeSelection, type ExplicitStoreScope, type StoreScopeNode } from './storeScope';
import { TrendPeriodControls } from './TrendPeriodControls';
import { buildDetailPeriodOptions, defaultTrendRange, trendHistoryStart, type TrendGranularity, type TrendMovingAverageMeta } from './trendPeriod';
import { groupDailyFacts, movingAverage } from './dailyFactSelectors';

const ProductTrendChart = lazy(() => import('./ProductTrendChart').then(module => ({ default: module.ProductTrendChart })));

type ProductDim = 'all' | 'shop' | 'platform' | 'channel';
const PRODUCT_DIMS: { key: ProductDim; label: string }[] = [
  { key: 'all', label: '整合' },
  { key: 'shop', label: '分店铺' },
  { key: 'platform', label: '分平台' },
  { key: 'channel', label: '堂食/外卖' },
];
const PRODUCT_CHANNELS = [
  { key: 'shop', label: '堂食' },
  { key: 'takeout', label: '外卖' },
];
const MAX_SELECTED_PRODUCTS = 5;
const DEFAULT_SELECTED_PRODUCTS = 2;

type ProductTrendRequest<T> = {
  cacheKey: string;
  load: (signal: AbortSignal) => Promise<T>;
};

export async function loadProductTrendRequests<T>(
  requests: ProductTrendRequest<T>[],
  cache: Map<string, Promise<T>>,
  signal: AbortSignal,
  maxConcurrency = 4,
): Promise<T[]> {
  const results = new Array<T>(requests.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < requests.length) {
      if (signal.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
      const index = nextIndex;
      nextIndex += 1;
      const request = requests[index];
      const cached = cache.get(request.cacheKey);
      const value = cached ? await cached : await request.load(signal);
      if (!cached && !signal.aborted) cache.set(request.cacheKey, Promise.resolve(value));
      results[index] = value;
    }
  };
  const workerCount = Math.min(Math.max(1, maxConcurrency), requests.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

type ProductComparisonMetricKey =
  | 'quantity'
  | 'sales_amount'
  | 'order_count'
  | 'amount_share';
type ProductComparisonMetrics = Partial<Record<ProductComparisonMetricKey, MetricComparison>>;

type ProductTrendDisplay = {
  results: Record<string, ProductTrendResult>;
  productKeys: string[];
  productLabels: Record<string, string>;
  granularity: TrendGranularity;
  includeCurrent: boolean;
  dateFrom: string;
  dateTo: string;
  shopKeys: string[];
  scopes: ExplicitStoreScope[];
  compareStores: boolean;
  storeLabel: string;
  storeLabels: Record<string, string>;
};

type ProductDailyFactMode = 'loading' | 'ready' | 'fallback';

type ProductDailyPayload = {
  top?: ProductRow[];
  bottom?: ProductRow[];
  total?: number;
  snapshot_status?: string;
  refresh_queued?: boolean;
  backfill_queued?: boolean;
  stores?: Record<string, ProductRow[]>;
};

type ProductDailyFact = ProductDailyPayload & {
  date: string;
  complete?: boolean;
};

function beijingTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function cacheMetaText(meta: AnalyticsCacheMeta | null): string {
  if (!meta) return '';
  const statusText = meta.status === 'hit' ? '命中' : meta.status === 'partial' ? '部分命中' : meta.status === 'miss' ? '未命中' : meta.status || '未知';
  const checked = Number(meta.server_checked_days ?? 0);
  const returned = Number(meta.returned_days ?? 0);
  return `缓存：${statusText}${checked ? ` · 校验 ${checked} 天` : ''}${checked ? ` · 返回 ${returned} 天` : ''}`;
}

function normalizeProductSelection(keys: string[], rows: ProductRow[]): string[] {
  const available = new Set(rows.map(row => row.product_key));
  return [...new Set(keys)].filter(key => available.has(key)).slice(0, MAX_SELECTED_PRODUCTS);
}

function productFactFromRecord(record: DailyFactRecord<ProductDailyPayload>): ProductDailyFact | null {
  if (!record.payload) return null;
  const completeness = record.completeness || {};
  const status = completenessStatus(completeness, record.payload.snapshot_status);
  return {
    ...record.payload,
    date: record.date,
    snapshot_status: status,
    complete: completenessIsReady(completeness, status),
  };
}

function aggregateProductFacts(facts: ProductDailyFact[], limit = 0, cacheMeta?: AnalyticsCacheMeta | null): { top: ProductRow[]; bottom: ProductRow[]; total?: number } & { snapshot_status?: string; cache_meta?: AnalyticsCacheMeta | null } {
  const rows = new Map<string, ProductRow>();
  for (const fact of facts) {
    for (const row of fact.top || []) {
      const key = row.product_key || row.product_name || '';
      if (!key) continue;
      const current = rows.get(key) || {
        product_key: key,
        product_name: row.product_name || null,
        quantity: 0,
        sales_amount: 0,
        order_count: 0,
        sales_share: 0,
      };
      current.product_name = current.product_name || row.product_name || null;
      current.quantity = Number(current.quantity || 0) + Number(row.quantity || 0);
      current.sales_amount = Number((Number(current.sales_amount || 0) + Number(row.sales_amount || 0)).toFixed(2));
      current.order_count = Number(current.order_count || 0) + Number(row.order_count || 0);
      rows.set(key, current);
    }
  }
  const sorted = [...rows.values()].sort((a, b) => (
    Number(b.sales_amount || 0) - Number(a.sales_amount || 0)
  ) || (
    Number(b.quantity || 0) - Number(a.quantity || 0)
  ));
  const totalSales = sorted.reduce((sum, row) => Number((sum + Number(row.sales_amount || 0)).toFixed(2)), 0) || 1;
  const withShare = sorted.map(row => ({
    ...row,
    sales_share: Number((Number(row.sales_amount || 0) / totalSales).toFixed(4)),
  }));
  const displayLimit = Math.max(0, Number(limit || 0));
  const top = displayLimit > 0 ? withShare.slice(0, displayLimit) : withShare;
  const bottom = displayLimit > 0 && withShare.length > displayLimit ? [...withShare.slice(-displayLimit)].reverse() : [];
  const hasPartial = facts.length === 0 || facts.some(fact => fact.snapshot_status && fact.snapshot_status !== 'ready');
  return {
    top,
    bottom,
    total: withShare.length,
    snapshot_status: withShare.length ? (hasPartial ? 'partial' : 'ready') : 'missing',
    cache_meta: cacheMeta || null,
  };
}

function filterProductFactsByRange(facts: ProductDailyFact[], dateFrom: string, dateTo: string): ProductDailyFact[] {
  return facts.filter(fact => fact.date >= dateFrom && fact.date <= dateTo);
}

function productMaWindows(granularity: TrendGranularity): number[] {
  if (granularity === 'week') return [4, 12, 26];
  if (granularity === 'month') return [3, 6, 12];
  return [7, 30, 180];
}

export function buildProductTrendFromFacts(
  product: { product_key: string; product_name?: string | null },
  facts: ProductDailyFact[],
  granularity: TrendGranularity,
  includeCurrent: boolean,
  expectedDateFrom: string,
  expectedDateTo: string,
  visibleDateFrom: string = expectedDateFrom,
  visibleDateTo: string = expectedDateTo,
): ProductTrendResult {
  const periods = groupDailyFacts<ProductDailyFact>(
    facts,
    granularity,
    true,
    expectedDateFrom,
    expectedDateTo,
  );
  const allPoints: ProductTrendPoint[] = periods.map((period) => {
    const ranking = aggregateProductFacts(period.facts);
    const row = ranking.top.find(item => item.product_key === product.product_key);
    return {
      period: period.key,
      period_start: period.dateFrom,
      period_end: period.dateTo,
      quantity: Number(row?.quantity || 0),
      sales_amount: Number(row?.sales_amount || 0),
      order_count: Number(row?.order_count || 0),
      missing: !period.complete,
      ...(period.inProgress ? { in_progress: true } : {}),
    };
  });
  const moving_averages = productMaWindows(granularity).map((window) => {
    const values = movingAverage(
      allPoints.map(point => point.missing || point.in_progress ? null : Number(point.quantity || 0)),
      window,
      granularity !== 'day',
    );
    allPoints.forEach((point, index) => {
      point[`ma${window}`] = values[index];
    });
    return {
      field: `ma${window}`,
      label: `MA${window}`,
      window,
      available: values.some(value => typeof value === 'number'),
      available_periods: values.filter(value => typeof value === 'number').length,
    };
  });
  const points = (includeCurrent ? allPoints : allPoints.filter(point => !point.missing && !point.in_progress)).filter(point => (
    String(point.period_end || '') >= visibleDateFrom && String(point.period_start || '') <= visibleDateTo
  ));
  return {
    metric: 'quantity',
    date_from: points[0]?.period_start || '',
    date_to: points[points.length - 1]?.period_end || '',
    dim_type: 'all',
    dim_key: 'ALL',
    product_key: product.product_key,
    product_name: product.product_name || product.product_key,
    granularity,
    moving_averages,
    points,
  };
}

function productFactsForStore(facts: ProductDailyFact[], storeKey: string): ProductDailyFact[] {
  return facts.map(fact => ({
    ...fact,
    top: fact.stores?.[storeKey] || [],
    bottom: [],
    total: fact.stores?.[storeKey]?.length || 0,
  }));
}

function selectionForLoadedProducts(rows: ProductRow[], currentKeys: string[], initialized: boolean): string[] {
  if (!initialized) return rows.slice(0, DEFAULT_SELECTED_PRODUCTS).map(row => row.product_key);
  if (currentKeys.length === 0) return [];
  const retained = normalizeProductSelection(currentKeys, rows);
  return retained.length > 0
    ? retained
    : rows.slice(0, DEFAULT_SELECTED_PRODUCTS).map(row => row.product_key);
}

function ProductMetricValue({
  value,
  comparison,
  displayMode,
  format = 'decimal',
  className = '',
}: {
  value: string;
  comparison?: MetricComparison;
  displayMode: ComparisonDisplayMode;
  format?: ComparisonValueFormat;
  className?: string;
}) {
  return (
    <div className="min-w-[5.5rem] text-right">
      <div className={`tabular-nums ${className}`}>{value}</div>
      <PeriodComparisonRate
        comparison={comparison}
        displayMode={displayMode}
        format={format}
        className="mt-0.5 block whitespace-normal text-[10px] leading-tight tabular-nums"
      />
    </div>
  );
}

function ProductMobileCards({
  rows,
  selectedKeys,
  onSelectionChange,
  comparisons,
  displayMode,
}: {
  rows: ProductRow[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  comparisons: Record<string, ProductComparisonMetrics | undefined>;
  displayMode: ComparisonDisplayMode;
}) {
  return (
    <div className="space-y-2 md:hidden">
      {rows.map((row, index) => (
        <div key={row.product_key} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400">产品</div>
              <div className="mt-0.5 break-words text-sm font-medium leading-5 text-slate-800">{row.product_name || row.product_key}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Checkbox
                aria-label={`选择产品 ${row.product_name || row.product_key}`}
                checked={selectedKeys.includes(row.product_key)}
                disabled={selectedKeys.length >= MAX_SELECTED_PRODUCTS && !selectedKeys.includes(row.product_key)}
                onChange={event => onSelectionChange(event.target.checked
                  ? [...selectedKeys, row.product_key]
                  : selectedKeys.filter(key => key !== row.product_key))}
              />
              <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">#{index + 1}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            <MobileField label="销量" value={<ProductMetricValue value={String(row.quantity || 0)} comparison={comparisons[row.product_key]?.quantity} displayMode={displayMode} format="decimal" />} tone="strong" />
            <MobileField label="销额" value={<ProductMetricValue value={yuan(Number(row.sales_amount || 0))} comparison={comparisons[row.product_key]?.sales_amount} displayMode={displayMode} format="money" />} tone="strong" />
            <MobileField label="订单数" value={<ProductMetricValue value={String(row.order_count || 0)} comparison={comparisons[row.product_key]?.order_count} displayMode={displayMode} format="integer" />} />
            <MobileField label="占比" value={<ProductMetricValue value={`${(Number(row.sales_share || 0) * 100).toFixed(1)}%`} comparison={comparisons[row.product_key]?.amount_share} displayMode={displayMode} format="percentagePoint" />} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProductSection({ show }: { show: (m: string) => void }) {
  const isMobile = useIsMobile();
  const [granularity, setGranularity] = useState<TrendGranularity>('week');
  const [trendRange, setTrendRange] = useState(() => defaultTrendRange('week', beijingTodayYmd()));
  const { dateFrom, dateTo, includeCurrent } = trendRange;
  const historyDateFrom = useMemo(
    () => trendHistoryStart(granularity, dateFrom),
    [dateFrom, granularity],
  );
  const [dim, setDim] = useState<ProductDim>('all');
  const [dimKey, setDimKey] = useState('ALL');
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('previous');
  const [comparisonDisplayMode, setComparisonDisplayMode] = useState<ComparisonDisplayMode>('percentage');
  const [detailPeriodKey, setDetailPeriodKey] = useState('');
  const [productComparisons, setProductComparisons] = useState<Record<string, ProductComparisonMetrics | undefined>>({});
  const [comparisonPeriod, setComparisonPeriod] = useState<{ date_from: string; date_to: string } | null>(null);
  const [scopeKeys, setScopeKeys] = useState<string[]>(['ALL']);
  const [scopeTree, setScopeTree] = useState<StoreScopeNode[]>([]);
  const [platforms, setPlatforms] = useState<PlatformDim[]>([]);
  const [data, setData] = useState<{ top: ProductRow[]; bottom: ProductRow[]; total?: number }>({ top: [], bottom: [], total: 0 });
  const [cacheMeta, setCacheMeta] = useState<AnalyticsCacheMeta | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string>('missing');
  const [productFacts, setProductFacts] = useState<ProductDailyFact[]>([]);
  const [productFactMode, setProductFactMode] = useState<ProductDailyFactMode>('loading');
  const [productFactRefreshSeq, setProductFactRefreshSeq] = useState(0);
  const [trendOpen, setTrendOpen] = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendDisplay, setTrendDisplay] = useState<ProductTrendDisplay | null>(null);
  const [trendProductKeys, setTrendProductKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [fullscreenFilterExpanded, setFullscreenFilterExpanded] = useState(false);
  const loadSeqRef = useRef(0);
  const trendSeqRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const trendAbortRef = useRef<AbortController | null>(null);
  const productFactAbortRef = useRef<AbortController | null>(null);
  const productFactRefreshConsumedRef = useRef(0);
  const productFactSettledKeyRef = useRef('');
  const trendCacheRef = useRef(new Map<string, Promise<Awaited<ReturnType<typeof getProductTrend>>>>());
  const trendContextRef = useRef('');
  const productSelectionInitializedRef = useRef(false);
  const { fullscreenChart, fullscreenPortrait, openFullscreen, closeFullscreen } = useAnalyticsChartFullscreen<'product-trend'>();
  const detailPeriodOptions = useMemo(
    () => buildDetailPeriodOptions(granularity, dateFrom, dateTo),
    [dateFrom, dateTo, granularity],
  );
  const selectedDetailPeriod = useMemo(
    () => detailPeriodOptions.find(option => option.key === detailPeriodKey)
      ?? detailPeriodOptions[detailPeriodOptions.length - 1],
    [detailPeriodKey, detailPeriodOptions],
  );
  const period = selectedDetailPeriod
    ? `${selectedDetailPeriod.dateFrom}_${selectedDetailPeriod.dateTo}`
    : `${dateFrom}_${dateTo}`;
  const dimOptions = useMemo(() => {
    if (dim === 'all') return [{ key: 'ALL', label: '全部产品' }];
    if (dim === 'shop') return [];
    if (dim === 'platform') {
      return platforms.map(p => ({ key: String(p.platform_code), label: p.platform_name || `平台${p.platform_code}` }));
    }
    if (dim === 'channel') return PRODUCT_CHANNELS;
    return [];
  }, [dim, platforms]);
  const scopeSelection = useMemo(
    () => resolveStoreScopeSelection(scopeKeys, scopeTree),
    [scopeKeys, scopeTree],
  );
  const { shopKeys, scopes } = scopeSelection;
  const hasUnresolvedShopScope = dim === 'shop' && !scopeKeys.includes('ALL') && shopKeys.length === 0;
  const isComparison = dim === 'shop' && scopes.length > 1;
  const selectedOption = dimOptions.find(o => o.key === dimKey) || dimOptions[0] || { key: 'ALL', label: '全部产品' };
  const productScope = `${PRODUCT_DIMS.find(d => d.key === dim)?.label || '整合'} · ${dim === 'shop' ? scopeSelection.label : selectedOption.label}`;
  const requestDimKey = dim === 'shop' ? 'ALL' : selectedOption.key;
  const requestDim = dim === 'shop' && scopeKeys.includes('ALL') ? 'all' : dim;
  const trendDimKey = dim === 'shop' ? 'ALL' : requestDimKey;
  const trendDim = dim === 'shop' ? undefined : requestDim;
  const canUseProductFacts = !hasUnresolvedShopScope && (dim === 'all' || dim === 'shop');
  const productStoreKeysKey = dim === 'shop' && !scopeKeys.includes('ALL') ? shopKeys.join(',') : '';
  const productFactParams = useMemo(() => ({
    shop: requestDimKey,
    dim_type: requestDim,
    store_keys: productStoreKeysKey ? productStoreKeysKey.split(',') : [],
    limit: 0,
    full_rows: true,
  }), [productStoreKeysKey, requestDim, requestDimKey]);
  const productFactQueryKey = useMemo(() => JSON.stringify([
    canUseProductFacts,
    granularity === 'day' ? historyDateFrom : dateFrom,
    dateTo,
    productFactParams,
    productFactRefreshSeq,
  ]), [canUseProductFacts, dateFrom, dateTo, granularity, historyDateFrom, productFactParams, productFactRefreshSeq]);
  const scopeLabels = useMemo(
    () => Object.fromEntries(scopes.map(scope => [scope.key, scope.label])),
    [scopes],
  );
  const selectedTrendProducts = trendProductKeys
    .map(key => {
      const row = data.top.find(item => item.product_key === key);
      if (row) return { product_key: row.product_key, product_name: row.product_name };
      const label = trendDisplay?.productLabels[key];
      return label ? { product_key: key, product_name: label } : null;
    })
    .filter((row): row is { product_key: string; product_name: string | null } => Boolean(row));
  const productSelectOptions = useMemo(() => {
    const current = data.top.map(row => ({ value: row.product_key, label: row.product_name || row.product_key }));
    const currentKeys = new Set(current.map(option => option.value));
    const retained = trendProductKeys
      .filter(key => !currentKeys.has(key))
      .map(key => ({ value: key, label: trendDisplay?.productLabels[key] || key }));
    return [...current, ...retained];
  }, [data.top, trendDisplay?.productLabels, trendProductKeys]);
  const displayProductKeys = trendDisplay?.productKeys || [];
  const primaryTrendResult = displayProductKeys.length > 0 ? trendDisplay?.results[displayProductKeys[0]] : undefined;
  const activeTrendPoints = primaryTrendResult?.points || [];
  const hasTrendPoints = displayProductKeys.some(key => (trendDisplay?.results[key]?.points.length || 0) > 0);
  const productTrends = displayProductKeys.length > 1
    ? Object.fromEntries(displayProductKeys.map(key => [key, trendDisplay?.results[key]?.points || []]))
    : undefined;
  const comparisonTrends = trendDisplay?.compareStores && primaryTrendResult?.store_trends
    ? buildScopeProductTrendSeries(trendDisplay.scopes, primaryTrendResult.store_trends)
    : undefined;
  const movingAverages: TrendMovingAverageMeta[] = displayProductKeys.length === 1
    ? primaryTrendResult?.moving_averages || []
    : [];
  const trendProductLabel = displayProductKeys.length > 1
    ? `已选 ${displayProductKeys.length} 个产品`
    : primaryTrendResult?.product_name || trendDisplay?.productLabels[displayProductKeys[0]] || '产品';
  const availableMovingAverageLabel = movingAverages
    .filter(item => item.available)
    .map(item => item.label)
    .join(' / ');
  const trendContextKey = [
    dateFrom,
    dateTo,
    granularity,
    includeCurrent ? '1' : '0',
    dim,
    selectedOption.key,
    scopeKeys.join(','),
    shopKeys.join(','),
  ].join('|');

  useEffect(() => {
    listStoreScopeTree().then(result => setScopeTree(result.nodes || [])).catch(e => show((e as Error).message));
    listPlatformDim().then(setPlatforms).catch(e => show((e as Error).message));
    /* eslint-disable-next-line */
  }, []);
  useEffect(() => {
    if (dim !== 'shop' && !dimOptions.some(o => o.key === dimKey)) setDimKey(dimOptions[0]?.key || 'ALL');
  }, [dimKey, dimOptions]);

  const applyLocalProductTrend = (
    products: Array<{ product_key: string; product_name?: string | null }>,
    facts: ProductDailyFact[] = productFacts,
  ) => {
    const nextProducts = products.filter(product => product.product_key);
    if (nextProducts.length === 0) {
      trendSeqRef.current += 1;
      trendAbortRef.current?.abort();
      setTrendLoading(false);
      setTrendDisplay(null);
      return;
    }
    const usableFacts = facts.filter(fact => fact.complete !== false);
    const productKeys = nextProducts.map(product => product.product_key);
    const compareStores = isComparison && nextProducts.length === 1;
    const results = Object.fromEntries(nextProducts.map(product => {
      const result = buildProductTrendFromFacts(
        product,
        usableFacts,
        granularity,
        includeCurrent,
        historyDateFrom,
        dateTo,
        dateFrom,
        dateTo,
      );
      if (compareStores) {
        result.store_keys = [...shopKeys];
        result.store_trends = Object.fromEntries(shopKeys.map(storeKey => [
          storeKey,
          buildProductTrendFromFacts(
            product,
            productFactsForStore(usableFacts, storeKey),
            granularity,
            includeCurrent,
            historyDateFrom,
            dateTo,
            dateFrom,
            dateTo,
          ).points,
        ]));
      }
      return [product.product_key, result];
    }));
    setTrendLoading(false);
    setTrendDisplay({
      results,
      productKeys,
      productLabels: Object.fromEntries(nextProducts.map(product => [
        product.product_key,
        product.product_name || product.product_key,
      ])),
      granularity,
      includeCurrent,
      dateFrom,
      dateTo,
      shopKeys: dim === 'shop' ? [...shopKeys] : [],
      scopes: dim === 'shop' ? [...scopes] : [],
      compareStores,
      storeLabel: dim === 'shop' ? scopeSelection.label : selectedOption.label,
      storeLabels: dim === 'shop' ? scopeLabels : {},
    });
  };

  useEffect(() => {
    if (!canUseProductFacts) {
      productFactAbortRef.current?.abort();
      productFactSettledKeyRef.current = productFactQueryKey;
      setProductFacts([]);
      setProductFactMode('fallback');
      return;
    }
    const queryKey = productFactQueryKey;
    const controller = new AbortController();
    productFactAbortRef.current?.abort();
    productFactAbortRef.current = controller;
    const forceRefresh = productFactRefreshSeq > productFactRefreshConsumedRef.current;
    if (forceRefresh) productFactRefreshConsumedRef.current = productFactRefreshSeq;
    setProductFactMode('loading');
    setLoading(true);
    setError('');
    setData({ top: [], bottom: [], total: 0 });
    setProductComparisons({});
    setComparisonPeriod(null);
    setCacheMeta(null);
    getProductDailyFacts<ProductDailyPayload>(
      granularity === 'day' ? historyDateFrom : dateFrom,
      dateTo,
      productFactParams,
      {
      signal: controller.signal,
      forceRefresh,
      },
    )
      .then((records: DailyFactRecord<ProductDailyPayload>[]) => {
        if (controller.signal.aborted) return;
        productFactSettledKeyRef.current = queryKey;
        setProductFacts(records.map(productFactFromRecord).filter((fact): fact is ProductDailyFact => Boolean(fact)));
        setProductFactMode('ready');
        if (forceRefresh) show('产品数据已刷新');
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        productFactSettledKeyRef.current = queryKey;
        setProductFacts([]);
        setProductFactMode('fallback');
        if (forceRefresh) show((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    /* eslint-disable-next-line */
  }, [canUseProductFacts, dateFrom, dateTo, granularity, historyDateFrom, productFactParams, productFactQueryKey, productFactRefreshSeq]);

  const load = (refresh = false, backfill = false, reloadTrend = false) => {
    if (hasUnresolvedShopScope || !selectedDetailPeriod) return;
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    loadAbortRef.current?.abort();
    if (reloadTrend) {
      trendSeqRef.current += 1;
      trendAbortRef.current?.abort();
      setTrendLoading(false);
    }
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);
    setError('');
    setData({ top: [], bottom: [], total: 0 });
    setProductComparisons({});
    setComparisonPeriod(null);
    setCacheMeta(null);
    const comparisonChannel = dim === 'channel'
      && (selectedOption.key === 'shop' || selectedOption.key === 'takeout')
      ? selectedOption.key
      : 'all';
    const comparisonRequest = comparisonMode === 'previous'
      ? fetchOperationsProducts({
          filters: {
            scopeKeys,
            storeKeys: dim === 'shop' && !scopeKeys.includes('ALL') ? shopKeys : [],
            channel: comparisonChannel,
            granularity,
            dateFrom: selectedDetailPeriod.dateFrom,
            dateTo: selectedDetailPeriod.dateTo,
            compare: comparisonMode,
          },
          platformIds: dim === 'platform' && Number.isFinite(Number(selectedOption.key))
            ? [Number(selectedOption.key)]
            : undefined,
          limit: 200,
          signal: controller.signal,
        }).catch(() => null)
      : Promise.resolve(null);
    Promise.all([
      getProducts('day', selectedDetailPeriod.dateTo, requestDimKey, refresh, 0, requestDim, backfill, {
        signal: controller.signal,
        dateFrom: selectedDetailPeriod.dateFrom,
        dateTo: selectedDetailPeriod.dateTo,
        storeKeys: dim === 'shop' && !scopeKeys.includes('ALL') ? shopKeys : undefined,
      }),
      comparisonRequest,
    ])
      .then(([res, comparison]) => {
        if (seq !== loadSeqRef.current) return;
        setData(res);
        setProductComparisons(Object.fromEntries(
          (comparison?.items || []).map(item => [item.product_key, item.comparison || {}]),
        ));
        setComparisonPeriod(comparison?.previous_period || null);
        setCacheMeta(res.cache_meta || null);
        setSnapshotStatus(String(res.snapshot_status || 'missing'));
        if (reloadTrend) {
          const nextProductKeys = selectionForLoadedProducts(
            res.top,
            trendProductKeys,
            productSelectionInitializedRef.current,
          );
          productSelectionInitializedRef.current = true;
          setTrendProductKeys(nextProductKeys);
          const nextProducts = nextProductKeys
            .map(key => res.top.find(row => row.product_key === key))
            .filter((row): row is ProductRow => Boolean(row));
          if (trendOpen && nextProducts.length > 0) loadTrend(nextProducts, refresh || backfill);
          else if (nextProducts.length === 0) setTrendDisplay(null);
        }
        if (refresh) {
          show(res.refresh_queued ? '已提交产品后台刷新，稍后自动读取最新快照' : '后台刷新提交失败，请稍后重试');
        }
        if (backfill) show(res.backfill_queued ? '已提交产品快照补全任务，完成后刷新查看' : '产品快照补全提交失败，请稍后重试');
      })
      .catch(e => {
        if (seq !== loadSeqRef.current || isAbortError(e)) return;
        const message = (e as Error).message;
        setError(message);
        show(message);
      })
      .finally(() => {
        if (seq === loadSeqRef.current) setLoading(false);
      });
  };
  useEffect(() => {
    if (selectedDetailPeriod && detailPeriodKey !== selectedDetailPeriod.key) {
      setDetailPeriodKey(selectedDetailPeriod.key);
    }
  }, [detailPeriodKey, selectedDetailPeriod]);
  useEffect(() => {
    if (hasUnresolvedShopScope) {
      loadSeqRef.current += 1;
      trendSeqRef.current += 1;
      loadAbortRef.current?.abort();
      trendAbortRef.current?.abort();
      setLoading(false);
      setTrendLoading(false);
      setData({ top: [], bottom: [], total: 0 });
      setTrendDisplay(null);
      setTrendProductKeys([]);
      setProductComparisons({});
      setComparisonPeriod(null);
      productSelectionInitializedRef.current = false;
      setCacheMeta(null);
      setSnapshotStatus('missing');
      setError('');
      return;
    }
    if (productFactSettledKeyRef.current !== productFactQueryKey) return;
    if (productFactMode === 'loading') return;
    const reloadTrend = trendContextRef.current !== trendContextKey;
    trendContextRef.current = trendContextKey;
    if (productFactMode === 'ready') {
      if (!selectedDetailPeriod) return;
      const seq = loadSeqRef.current + 1;
      loadSeqRef.current = seq;
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      const currentFacts = filterProductFactsByRange(productFacts, selectedDetailPeriod.dateFrom, selectedDetailPeriod.dateTo);
      const ranking = aggregateProductFacts(currentFacts, 0);
      setData(ranking);
      setCacheMeta(ranking.cache_meta || null);
      setSnapshotStatus(String(ranking.snapshot_status || 'missing'));
      setError('');
      setLoading(comparisonMode === 'previous');
      const comparisonChannel = dim === 'channel'
        && (selectedOption.key === 'shop' || selectedOption.key === 'takeout')
        ? selectedOption.key
        : 'all';
      const comparisonRequest = comparisonMode === 'previous'
        ? fetchOperationsProducts({
            filters: {
              scopeKeys,
              storeKeys: dim === 'shop' && !scopeKeys.includes('ALL') ? shopKeys : [],
              channel: comparisonChannel,
              granularity,
              dateFrom: selectedDetailPeriod.dateFrom,
              dateTo: selectedDetailPeriod.dateTo,
              compare: comparisonMode,
            },
            platformIds: dim === 'platform' && Number.isFinite(Number(selectedOption.key))
              ? [Number(selectedOption.key)]
              : undefined,
            limit: 200,
            signal: controller.signal,
          }).catch(() => null)
        : Promise.resolve(null);
      comparisonRequest
        .then((comparison) => {
          if (seq !== loadSeqRef.current || controller.signal.aborted) return;
          setProductComparisons(Object.fromEntries(
            (comparison?.items || []).map(item => [item.product_key, item.comparison || {}]),
          ));
          setComparisonPeriod(comparison?.previous_period || null);
        })
        .finally(() => {
          if (seq === loadSeqRef.current && !controller.signal.aborted) setLoading(false);
        });
      if (reloadTrend) {
        const nextProductKeys = selectionForLoadedProducts(
          ranking.top,
          trendProductKeys,
          productSelectionInitializedRef.current,
        );
        productSelectionInitializedRef.current = true;
        setTrendProductKeys(nextProductKeys);
        const nextProducts = nextProductKeys
          .map(key => ranking.top.find(row => row.product_key === key))
          .filter((row): row is ProductRow => Boolean(row));
        if (trendOpen && nextProducts.length > 0) {
          if (granularity === 'day') applyLocalProductTrend(nextProducts, productFacts);
          else loadTrend(nextProducts);
        }
        else if (nextProducts.length === 0) setTrendDisplay(null);
      }
      return () => {
        controller.abort();
      };
    }
    load(false, false, reloadTrend);
    return () => {
      loadAbortRef.current?.abort();
    };
    /* eslint-disable-next-line */
  }, [selectedDetailPeriod?.dateFrom, selectedDetailPeriod?.dateTo, comparisonMode, trendContextKey, productFactMode, productFactQueryKey, productFacts]);
  useEffect(() => {
    if (!fullscreenChart) setFullscreenFilterExpanded(false);
  }, [fullscreenChart]);
  useEffect(() => () => trendAbortRef.current?.abort(), []);

  const loadTrend = (
    products: Array<{ product_key: string; product_name?: string | null }> = selectedTrendProducts,
    forceRefresh = false,
  ) => {
    if (products.length === 0 || hasUnresolvedShopScope) return;
    const trendSeq = trendSeqRef.current + 1;
    trendSeqRef.current = trendSeq;
    trendAbortRef.current?.abort();
    const controller = new AbortController();
    trendAbortRef.current = controller;
    setTrendLoading(true);
    const compareStores = isComparison && products.length === 1;
    const trendStoreKeys = dim === 'shop' && !scopeKeys.includes('ALL') ? shopKeys : undefined;
    const requests = products.map(product => {
      const cacheKey = JSON.stringify([
        product.product_key,
        dateFrom,
        dateTo,
        trendDimKey,
        trendDim,
        granularity,
        includeCurrent,
        compareStores,
        trendStoreKeys || [],
      ]);
      if (forceRefresh) trendCacheRef.current.delete(cacheKey);
      return {
        cacheKey,
        load: (signal: AbortSignal) => getProductTrend(
          product.product_key,
          dateFrom,
          dateTo,
          trendDimKey,
          trendDim,
          {
            forceRefresh,
            granularity,
            includeCurrent,
            includeStoreTrends: compareStores,
            signal,
            storeKeys: trendStoreKeys,
          },
        ),
      };
    });
    loadProductTrendRequests(requests, trendCacheRef.current, controller.signal)
      .then(results => {
        if (trendSeq !== trendSeqRef.current) return;
        const productKeys = products.map(product => product.product_key);
        setTrendDisplay({
          results: Object.fromEntries(results.map((result, index) => [productKeys[index], result])),
          productKeys,
          productLabels: Object.fromEntries(products.map(product => [
            product.product_key,
            product.product_name || product.product_key,
          ])),
          granularity,
          includeCurrent,
          dateFrom,
          dateTo,
          shopKeys: dim === 'shop' ? [...shopKeys] : [],
          scopes: dim === 'shop' ? [...scopes] : [],
          compareStores,
          storeLabel: dim === 'shop' ? scopeSelection.label : selectedOption.label,
          storeLabels: scopeLabels,
        });
      })
      .catch(e => {
        if (isAbortError(e) || trendSeq !== trendSeqRef.current) return;
        show((e as Error).message);
      })
      .finally(() => {
        if (trendSeq === trendSeqRef.current) setTrendLoading(false);
      });
  };

  const toggleTrend = () => {
    if (trendOpen) {
      setTrendOpen(false);
      return;
    }
    setTrendOpen(true);
    if (productFactMode === 'ready' && granularity === 'day') {
      applyLocalProductTrend(selectedTrendProducts);
      return;
    }
    loadTrend(selectedTrendProducts);
  };

  const rows = useMemo<ProductRow[]>(() => data.top, [data.top]);
  const handleProductSelection = (keys: string[]) => {
    const availableKeys = [...new Set(keys)].filter(key => data.top.some(row => row.product_key === key));
    const nextKeys = normalizeProductSelection(availableKeys, data.top);
    if (availableKeys.length > MAX_SELECTED_PRODUCTS) show(`最多同时选择 ${MAX_SELECTED_PRODUCTS} 个产品`);
    productSelectionInitializedRef.current = true;
    setTrendProductKeys(nextKeys);
    if (!trendOpen) return;
    if (nextKeys.length === 0) {
      trendSeqRef.current += 1;
      trendAbortRef.current?.abort();
      setTrendLoading(false);
      setTrendDisplay(null);
      return;
    }
    const products = nextKeys
      .map(key => data.top.find(row => row.product_key === key))
      .filter((row): row is ProductRow => Boolean(row));
    if (productFactMode === 'ready' && granularity === 'day') {
      applyLocalProductTrend(products);
      return;
    }
    loadTrend(products);
  };
  const handleGranularityChange = (next: TrendGranularity) => {
    setGranularity(next);
    setTrendRange(defaultTrendRange(next, beijingTodayYmd()));
  };
  const handleRangeChange = (nextFrom: string, nextTo: string) => {
    setTrendRange(current => ({ ...current, dateFrom: nextFrom, dateTo: nextTo }));
  };
  const productExportTables = useMemo<TableDisplayData[]>(() => {
    const showComparison = comparisonMode === 'previous';
    const exportCell = (
      value: TableDisplayValue,
      comparison: MetricComparison | undefined,
      format: ComparisonValueFormat,
    ): TableDisplayCell => (
      showComparison
        ? {
            value,
            comparisons: comparisonDisplayItems(comparison, comparisonDisplayMode, format),
          }
        : value
    );
    return [{
      title: '全部产品',
      headers: ['产品', '销量', '销额', '订单数', '占比'],
      rows: rows.map(row => [
        row.product_name || row.product_key,
        exportCell(row.quantity, productComparisons[row.product_key]?.quantity, 'decimal'),
        exportCell(yuan(Number(row.sales_amount)), productComparisons[row.product_key]?.sales_amount, 'money'),
        exportCell(row.order_count, productComparisons[row.product_key]?.order_count, 'integer'),
        exportCell(`${(Number(row.sales_share) * 100).toFixed(1)}%`, productComparisons[row.product_key]?.amount_share, 'percentagePoint'),
      ]),
    }];
  }, [comparisonDisplayMode, comparisonMode, productComparisons, rows]);

  const productColumns: TableColumnsType<ProductRow> = [
    {
      title: '产品',
      key: 'product',
      sorter: (a, b) => (a.product_name || a.product_key).localeCompare(b.product_name || b.product_key, 'zh-CN'),
      render: (_, r) => (
        <span className="text-slate-700">{r.product_name || r.product_key}</span>
      ),
    },
    {
      title: '销量',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'right',
      sorter: (a, b) => Number(a.quantity || 0) - Number(b.quantity || 0),
      render: (value, row) => <ProductMetricValue value={String(value)} comparison={productComparisons[row.product_key]?.quantity} displayMode={comparisonDisplayMode} format="decimal" className="text-slate-600" />,
    },
    {
      title: '销额',
      dataIndex: 'sales_amount',
      key: 'sales_amount',
      align: 'right',
      sorter: (a, b) => Number(a.sales_amount || 0) - Number(b.sales_amount || 0),
      render: (value, row) => <ProductMetricValue value={yuan(Number(value))} comparison={productComparisons[row.product_key]?.sales_amount} displayMode={comparisonDisplayMode} format="money" className="text-slate-600" />,
    },
    {
      title: '订单数',
      dataIndex: 'order_count',
      key: 'order_count',
      align: 'right',
      sorter: (a, b) => Number(a.order_count || 0) - Number(b.order_count || 0),
      render: (value, row) => <ProductMetricValue value={String(value)} comparison={productComparisons[row.product_key]?.order_count} displayMode={comparisonDisplayMode} format="integer" className="text-slate-600" />,
    },
    {
      title: '占比',
      dataIndex: 'sales_share',
      key: 'sales_share',
      align: 'right',
      sorter: (a, b) => Number(a.sales_share || 0) - Number(b.sales_share || 0),
      render: (value, row) => <ProductMetricValue value={`${(Number(value) * 100).toFixed(1)}%`} comparison={productComparisons[row.product_key]?.amount_share} displayMode={comparisonDisplayMode} format="percentagePoint" className="text-slate-500" />,
    },
  ];
  const renderControls = (mobile = false, fullscreen = false) => (
    <>
      <Select
        {...searchableSelectProps}
        className={`${inputCls} ${mobile ? 'w-full' : 'min-w-[140px]'}`}
        aria-label="产品维度"
        value={dim}
        onChange={(value) => { setDim(value as ProductDim); setDimKey('ALL'); setScopeKeys(['ALL']); }}
        options={PRODUCT_DIMS.map(d => ({ value: d.key, label: d.label }))}
        popupMatchSelectWidth={false}
      />
      {dim === 'shop' ? (
        <div className={mobile ? 'w-full' : 'w-[260px] min-w-[220px]'}>
          <StoreScopePicker
            nodes={scopeTree}
            value={scopeKeys}
            onChange={setScopeKeys}
            fullscreen={fullscreen}
            ariaLabel={fullscreen ? '产品全屏门店范围' : '产品门店范围'}
          />
        </div>
      ) : dim !== 'all' ? (
        <Select
          {...searchableSelectProps}
          className={`${inputCls} ${mobile ? 'w-full' : 'min-w-[220px]'}`}
          aria-label="产品维度值"
          value={selectedOption.key}
          onChange={(value) => setDimKey(value as string)}
          disabled={dimOptions.length === 0}
          options={dimOptions.length === 0
            ? [{ value: '', label: '暂无选项' }]
            : dimOptions.map(o => ({ value: o.key, label: o.label }))}
          popupMatchSelectWidth={false}
        />
      ) : null}
      <ComparisonModeSelect ariaLabel={mobile ? '产品移动端对比方式' : '产品对比方式'} value={comparisonMode} onChange={setComparisonMode} mobile={mobile} />
      <div className={`${mobile ? 'w-full' : 'min-w-[20rem] flex-1'}`}>
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
      <Button autoInsertSpace={false} htmlType="button" className={`h-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer ${mobile ? 'w-full' : 'md:ml-auto'}`} disabled={loading || hasUnresolvedShopScope} onClick={() => {
        if (canUseProductFacts) {
          setProductFactRefreshSeq(value => value + 1);
          return;
        }
        load(true, false, true);
      }}>{loading ? '刷新中…' : '刷新'}</Button>
    </>
  );

  const tbl = (rows: ProductRow[]) => (
    <TableDisplayFrame
      title="全部产品"
      subtitle={selectedDetailPeriod?.label || '暂无'}
      filename={`产品销售_${productScope}_${period}`}
      tableClassName="overflow-x-auto"
      exportTables={productExportTables}
      toolbarExtra={(
        <div data-testid="product-table-period-controls" className="flex flex-wrap items-center justify-end gap-2">
          <span className="hidden text-xs font-medium text-slate-500 sm:inline">统计周期</span>
          <span className="shrink-0 text-xs text-slate-500">对比展示</span>
          <ComparisonDisplaySelect
            ariaLabel="产品对比展示"
            value={comparisonDisplayMode}
            onChange={setComparisonDisplayMode}
            disabled={comparisonMode !== 'previous'}
          />
          <DetailPeriodSelect
            options={detailPeriodOptions}
            value={selectedDetailPeriod?.key}
            onChange={setDetailPeriodKey}
            label="切换周期"
            ariaLabel="产品数据周期"
          />
        </div>
      )}
    >
      <div className="text-xs text-slate-400 mb-2">⚠ 商品销额按订单商品原价/销售额统计，不扣优惠、退款和平台佣金，不能直接等同财务净实收。</div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>已选 {trendProductKeys.length} / {MAX_SELECTED_PRODUCTS} 个产品</span>
        {trendProductKeys.length > 0 ? (
          <Button type="link" size="small" className="h-auto px-0 text-xs" onClick={() => handleProductSelection([])}>
            清空选择
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? <div className="text-slate-400 text-sm">—</div> : isMobile ? (
        <ProductMobileCards
          rows={rows}
          selectedKeys={trendProductKeys}
          onSelectionChange={handleProductSelection}
          comparisons={productComparisons}
          displayMode={comparisonDisplayMode}
        />
      ) : (
        <Table<ProductRow>
          columns={productColumns}
          dataSource={rows}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          rowSelection={{
            selectedRowKeys: trendProductKeys,
            onChange: selectedRowKeys => handleProductSelection(selectedRowKeys.map(String)),
            getCheckboxProps: record => ({
              disabled: trendProductKeys.length >= MAX_SELECTED_PRODUCTS && !trendProductKeys.includes(record.product_key),
            }),
          }}
          rowKey="product_key"
          size="small"
          scroll={{ x: 'max-content' }}
        />
      )}
      <ComparisonPeriodNote previousPeriod={comparisonPeriod} />
    </TableDisplayFrame>
  );

  return (
    <Card>
      <MobileInlineFilter
        summary={`${productScope} · ${dateFrom.slice(5)} 至 ${dateTo.slice(5)}`}
        open={filterExpanded}
        onToggle={() => setFilterExpanded(v => !v)}
      >
          {renderControls(true)}
      </MobileInlineFilter>
      <div className="mb-4 hidden flex-wrap items-center gap-2 md:flex">
        {renderControls(false)}
      </div>
      <div className="mb-3 text-xs text-slate-500">当前口径：{productScope}</div>
      {hasUnresolvedShopScope ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          当前门店范围未解析到食亨门店，请检查门店映射。
        </div>
      ) : null}
      {cacheMeta && <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">{cacheMetaText(cacheMeta)}</div>}
      {snapshotStatus === 'partial' && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span>小时快照不完整，当前产品汇总可能偏小。</span>
	          <Button autoInsertSpace={false} htmlType="button" className="h-auto rounded-md border-0 bg-amber-100 px-2 py-1 font-medium shadow-none hover:bg-amber-200 disabled:opacity-50" disabled={loading} onClick={() => load(false, true, true)}>
	            补全快照
	          </Button>
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          产品数据读取失败：{error}
        </div>
      )}
      {(data.top.length > 0 || trendProductKeys.length > 0) && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white">
          <Button autoInsertSpace={false}
            htmlType="button"
            className="flex h-auto w-full items-center justify-between gap-3 border-0 px-4 py-3 text-left shadow-none cursor-pointer"
            onClick={toggleTrend}
          >
            <div>
              <div className="text-sm font-medium text-slate-700">单品销量趋势</div>
              <div className="mt-1 text-xs text-slate-400">
                {trendDisplay?.compareStores
                  ? '按当前范围展示销量 · 已选范围对比'
                  : displayProductKeys.length > 1
                    ? `${displayProductKeys.length} 个产品销量对比`
                    : `按当前范围展示销量 · ${availableMovingAverageLabel || '销量'}`}
              </div>
              {trendDisplay && !trendDisplay.compareStores && displayProductKeys.length === 1 ? <MovingAverageStatus items={movingAverages} /> : null}
            </div>
            <span className="text-xs font-medium text-blue-600">{trendOpen ? '收起' : '展开'}</span>
          </Button>
          {trendOpen && (
            <div className="border-t border-slate-100 px-4 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Select
                  {...searchableSelectProps}
                  mode="multiple"
                  maxCount={MAX_SELECTED_PRODUCTS}
                  maxTagCount="responsive"
                  allowClear
                  className={`${inputCls} min-w-[18rem] flex-1`}
                  value={trendProductKeys}
                  onChange={handleProductSelection}
                  aria-label="趋势产品选择"
                  placeholder="选择要对比的产品"
                  options={productSelectOptions}
                  popupMatchSelectWidth={false}
                />
                <span className="text-xs text-slate-400">{trendDisplay?.dateFrom || dateFrom} 至 {trendDisplay?.dateTo || dateTo}</span>
              </div>
              {trendDisplay && hasTrendPoints ? (
                <div className="relative">
                  <Suspense fallback={<div className="flex h-[20rem] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">图表加载中…</div>}>
                    <ProductTrendChart
                      points={activeTrendPoints}
                      productName={trendProductLabel}
                      productTrends={productTrends}
                      productLabels={trendDisplay.productLabels}
                      storeTrends={comparisonTrends}
                      storeLabels={trendDisplay.storeLabels}
                      granularity={trendDisplay.granularity}
                      movingAverages={movingAverages}
                      onFullscreen={() => openFullscreen('product-trend')}
                    />
                  </Suspense>
                  {trendLoading ? (
                    <div aria-label="产品趋势数据更新中" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 text-sm text-slate-500">更新中…</div>
                  ) : null}
                </div>
              ) : trendLoading ? (
                <div className="flex h-[20rem] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">加载中…</div>
              ) : (
                <div className="flex h-[20rem] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">暂无单品趋势数据</div>
              )}
            </div>
          )}
        </div>
      )}
      {fullscreenChart === 'product-trend' ? (
        <ChartFullscreenLayer
          title="单品销量趋势"
          subtitle={`${trendProductLabel} · ${(trendDisplay?.dateFrom || dateFrom).slice(5)} 至 ${(trendDisplay?.dateTo || dateTo).slice(5)}`}
          showRotateHint={fullscreenPortrait}
          controls={(
            <div className="relative">
              <FullscreenFilterButton
                expanded={fullscreenFilterExpanded}
                onClick={() => setFullscreenFilterExpanded(v => !v)}
              />
              {fullscreenFilterExpanded ? (
                <div className="chart-fullscreen-filter-panel">
                  <div className="mb-1.5 truncate text-[11px] text-slate-400">{productScope}</div>
                  <div className="space-y-2">
                    <Select
                      {...searchableSelectProps}
                      mode="multiple"
                      maxCount={MAX_SELECTED_PRODUCTS}
                      maxTagCount="responsive"
                      allowClear
                      className={`${inputCls} w-full`}
                      value={trendProductKeys}
                      onChange={handleProductSelection}
                      aria-label="趋势产品选择"
                      placeholder="选择要对比的产品"
                      options={productSelectOptions}
                      popupMatchSelectWidth={false}
                    />
                    {renderControls(true, true)}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          onClose={closeFullscreen}
        >
          {trendDisplay && hasTrendPoints ? (
            <div className="relative h-full min-h-0">
              <Suspense fallback={<div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">图表加载中…</div>}>
                <ProductTrendChart
                  points={activeTrendPoints}
                  productName={trendProductLabel}
                  productTrends={productTrends}
                  productLabels={trendDisplay.productLabels}
                  storeTrends={comparisonTrends}
                  storeLabels={trendDisplay.storeLabels}
                  granularity={trendDisplay.granularity}
                  movingAverages={movingAverages}
                  fullscreen
                />
              </Suspense>
              {trendLoading || loading ? (
                <div aria-label="全屏产品趋势数据更新中" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 text-sm text-slate-500">更新中…</div>
              ) : null}
            </div>
          ) : trendLoading || loading ? (
            <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">加载中...</div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">暂无单品趋势数据</div>
          )}
        </ChartFullscreenLayer>
      ) : null}
      {hasUnresolvedShopScope || (error && data.top.length === 0) ? (
        <div className="text-slate-400 text-sm py-8 text-center">{hasUnresolvedShopScope ? '当前范围无可用门店' : '请处理上方错误后重试'}</div>
      ) : loading && data.top.length === 0 ? (
        <div className="text-slate-400 text-sm py-8 text-center">加载中…</div>
      ) : tbl(rows)}
    </Card>
  );
}
