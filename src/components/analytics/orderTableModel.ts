import type { OrderDailyFact, OrderFactTotals } from '../../api/analyticsDailyTypes';
import type { OrderRow } from '../../api/analytics';
import type { MetricComparison, OperationsOverview } from '../../features/operations-analysis/api/client';
import {
  aggregateOrderFacts,
  filterOrderFactsByStores,
  groupDailyFacts,
} from './dailyFactSelectors';
import type { TrendGranularity } from './trendPeriod';

export type OrderSecondaryDimension = 'none' | 'channel' | 'platform';

export type OrderComputedMetrics = {
  order_count: number;
  paid_amount_cent: number;
  income_amount_cent: number;
  refund_amount_cent: number;
  net_income_cent: number;
  avg_order_value_cent: number;
  refund_rate: number;
};

export type OrderMetricComparisons = {
  [K in keyof OrderComputedMetrics]: MetricComparison;
};

export type OrderBackendMetricComparisons = Record<string, MetricComparison>;

export type OrderStoreTableRow = {
  key: string;
  storeKey: string;
  storeLabel: string;
  totals: OrderFactTotals;
  metrics?: OrderBackendMetricComparisons;
  breakdown: Record<string, OrderFactTotals>;
  breakdownMetrics?: Record<string, OrderBackendMetricComparisons>;
};

export type OrderStoreTableSummary = {
  totals: OrderFactTotals;
  metrics?: OrderBackendMetricComparisons;
  breakdown: Record<string, OrderFactTotals>;
  breakdownMetrics?: Record<string, OrderBackendMetricComparisons>;
  avgOrderValueCent: number;
  refundRate: number;
};

export type OrderStorePeriodRow = {
  key: string;
  period: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  totals: OrderFactTotals;
  metrics: OrderComputedMetrics;
  comparison: OrderMetricComparisons;
  complete: boolean;
};

const TOTAL_FIELDS = [
  'order_count',
  'paid_amount_cent',
  'income_amount_cent',
  'refund_amount_cent',
  'net_amount_cent',
  'net_income_cent',
] as const;

function emptyTotals(): OrderFactTotals {
  return {
    order_count: 0,
    paid_amount_cent: 0,
    income_amount_cent: 0,
    refund_amount_cent: 0,
    net_amount_cent: 0,
    net_income_cent: 0,
    completed_days: 0,
    expected_days: 0,
  };
}

function addTotals(target: OrderFactTotals, source?: Partial<OrderFactTotals>): OrderFactTotals {
  if (!source) return target;
  for (const field of TOTAL_FIELDS) target[field] += Number(source[field] || 0);
  return target;
}

export function orderComputedMetrics(totals: OrderFactTotals): OrderComputedMetrics {
  const orderCount = Number(totals.order_count || 0);
  const paidAmountCent = Number(totals.paid_amount_cent || 0);
  const incomeAmountCent = Number(totals.income_amount_cent || 0);
  const refundAmountCent = Number(totals.refund_amount_cent || 0);
  const netIncomeCent = Number(totals.net_income_cent || 0);
  return {
    order_count: orderCount,
    paid_amount_cent: paidAmountCent,
    income_amount_cent: incomeAmountCent,
    refund_amount_cent: refundAmountCent,
    net_income_cent: netIncomeCent,
    avg_order_value_cent: orderCount > 0
      ? Math.round(netIncomeCent / orderCount)
      : 0,
    refund_rate: paidAmountCent > 0
      ? refundAmountCent / paidAmountCent
      : 0,
  };
}

export function collectOrderBreakdownKeys(
  facts: OrderDailyFact[],
  secondaryDimension: OrderSecondaryDimension,
): string[] {
  if (secondaryDimension === 'none') return [];
  if (secondaryDimension === 'channel') return ['shop', 'takeout'];

  const keys = new Set<string>();
  for (const fact of facts) {
    for (const store of Object.values(fact.stores || {})) {
      Object.keys(store.platform_totals || {}).forEach((key) => keys.add(key));
    }
  }
  return [...keys].sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
}

export function buildOrderStoreRows(
  facts: OrderDailyFact[],
  secondaryDimension: OrderSecondaryDimension,
): OrderStoreTableRow[] {
  const rows = new Map<string, OrderStoreTableRow>();

  for (const fact of facts) {
    for (const [fallbackKey, store] of Object.entries(fact.stores || {})) {
      const storeKey = store.store_key || fallbackKey;
      const row = rows.get(storeKey) || {
        key: storeKey,
        storeKey,
        storeLabel: store.store_label || storeKey,
        totals: emptyTotals(),
        breakdown: {},
      };
      addTotals(row.totals, store);
      row.totals.expected_days = Number(row.totals.expected_days || 0) + 1;
      row.totals.completed_days = Number(row.totals.completed_days || 0) + (fact.complete === false ? 0 : 1);

      const dimensionTotals = secondaryDimension === 'channel'
        ? store.source_totals
        : secondaryDimension === 'platform'
          ? store.platform_totals
          : undefined;
      for (const [dimensionKey, values] of Object.entries(dimensionTotals || {})) {
        row.breakdown[dimensionKey] ||= emptyTotals();
        addTotals(row.breakdown[dimensionKey], values);
      }
      rows.set(storeKey, row);
    }
  }

  return [...rows.values()].sort((left, right) => (
    right.totals.net_income_cent - left.totals.net_income_cent
    || left.storeLabel.localeCompare(right.storeLabel, 'zh-CN')
  ));
}

function legacyRowTotals(row: OrderRow): OrderFactTotals {
  return {
    order_count: Number(row.order_count || 0),
    paid_amount_cent: Math.round(Number(row.paid_amount || 0) * 100),
    income_amount_cent: Math.round(Number(row.income_amount || 0) * 100),
    refund_amount_cent: Math.round(Number(row.refund_amount || 0) * 100),
    net_amount_cent: Math.round(Number(row.net_amount || 0) * 100),
    net_income_cent: Math.round(Number(row.net_income || 0) * 100),
  };
}

export function buildOrderStoreRowsFromLegacy(
  legacyRows: OrderRow[],
  secondaryDimension: OrderSecondaryDimension,
  storeTotalRows: OrderRow[] = [],
): OrderStoreTableRow[] {
  const rows = new Map<string, OrderStoreTableRow>();
  for (const legacyRow of legacyRows) {
    const [storeKey, dimensionKey] = String(legacyRow.dim_key || '').split('|', 2);
    const storeLabel = String(legacyRow.dim_label || storeKey).split(' · ', 1)[0] || storeKey;
    const row = rows.get(storeKey) || {
      key: storeKey,
      storeKey,
      storeLabel,
      totals: emptyTotals(),
      breakdown: {},
    };
    const values = legacyRowTotals(legacyRow);
    addTotals(row.totals, values);
    if (secondaryDimension !== 'none' && dimensionKey) {
      row.breakdown[dimensionKey] ||= emptyTotals();
      addTotals(row.breakdown[dimensionKey], values);
    }
    rows.set(storeKey, row);
  }
  if (secondaryDimension !== 'none' && storeTotalRows.length) {
    for (const totalRow of buildOrderStoreRowsFromLegacy(storeTotalRows, 'none')) {
      const row = rows.get(totalRow.storeKey) || {
        ...totalRow,
        breakdown: {},
      };
      row.storeLabel = totalRow.storeLabel;
      row.totals = totalRow.totals;
      rows.set(row.storeKey, row);
    }
  }
  return [...rows.values()].sort((left, right) => (
    right.totals.net_income_cent - left.totals.net_income_cent
    || left.storeLabel.localeCompare(right.storeLabel, 'zh-CN')
  ));
}


function moneyMetricToCent(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const raw = typeof value === 'number'
    ? value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
    : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const negative = trimmed.startsWith('-');
  const normalized = trimmed.replace(/^[+-]/, '');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return 0;
  const [wholePart, fractionPart = ''] = normalized.split('.');
  const paddedFraction = `${fractionPart}000`;
  const cents = (Number.parseInt(wholePart || '0', 10) * 100)
    + Number.parseInt(paddedFraction.slice(0, 2), 10)
    + (Number(paddedFraction[2] || 0) >= 5 ? 1 : 0);
  return negative ? -cents : cents;
}

export function operationMetricsToOrderTotals(metrics?: Record<string, MetricComparison>): OrderFactTotals {
  const paidAmountCent = moneyMetricToCent(metrics?.paid_amount?.current);
  const incomeAmountCent = moneyMetricToCent(metrics?.income_amount?.current);
  const refundAmountCent = moneyMetricToCent(metrics?.refund_amount?.current);
  return {
    order_count: Math.round(Number(metrics?.order_count?.current || 0)),
    paid_amount_cent: paidAmountCent,
    income_amount_cent: incomeAmountCent,
    refund_amount_cent: refundAmountCent,
    net_amount_cent: incomeAmountCent - refundAmountCent,
    net_income_cent: moneyMetricToCent(metrics?.net_income?.current),
  };
}

function splitStoreBreakdownKey(value: string): [string, string] {
  const separator = value.indexOf('|');
  if (separator < 0) return [value, ''];
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function operationStoreRowLabel(item: OperationsOverview['stores'][number], storeKey: string): string {
  return String(item.store_label || item.dim_label || storeKey);
}

export function buildOrderStoreRowsFromOperationsOverview(
  overview: OperationsOverview,
  secondaryDimension: OrderSecondaryDimension,
): OrderStoreTableRow[] {
  const rows = new Map<string, OrderStoreTableRow>();
  for (const item of overview.stores || []) {
    const storeKey = String(item.store_key || item.dim_key || '');
    if (!storeKey) continue;
    rows.set(storeKey, {
      key: storeKey,
      storeKey,
      storeLabel: operationStoreRowLabel(item, storeKey),
      totals: operationMetricsToOrderTotals(item.metrics),
      metrics: item.metrics,
      breakdown: {},
      breakdownMetrics: {},
    });
  }

  const breakdownRows = secondaryDimension === 'channel'
    ? overview.store_channels || []
    : secondaryDimension === 'platform'
      ? overview.store_platforms || []
      : [];
  for (const item of breakdownRows) {
    const [storeKey, breakdownKey] = splitStoreBreakdownKey(String(item.dim_key || ''));
    if (!storeKey || !breakdownKey) continue;
    const row = rows.get(storeKey) || {
      key: storeKey,
      storeKey,
      storeLabel: String(item.store_label || item.dim_label || storeKey).split(' · ', 1)[0] || storeKey,
      totals: emptyTotals(),
      breakdown: {},
      breakdownMetrics: {},
    };
    row.breakdown[breakdownKey] = operationMetricsToOrderTotals(item.metrics);
    row.breakdownMetrics ||= {};
    row.breakdownMetrics[breakdownKey] = item.metrics;
    rows.set(storeKey, row);
  }

  return [...rows.values()].sort((left, right) => (
    right.totals.net_income_cent - left.totals.net_income_cent
    || left.storeLabel.localeCompare(right.storeLabel, 'zh-CN')
  ));
}

export function buildOrderStoreSummaryFromOperationsOverview(
  overview: OperationsOverview,
  secondaryDimension: OrderSecondaryDimension,
): OrderStoreTableSummary {
  const totals = operationMetricsToOrderTotals(overview.metrics);
  const breakdown: Record<string, OrderFactTotals> = {};
  const breakdownMetrics: Record<string, OrderBackendMetricComparisons> = {};
  const breakdownRows = secondaryDimension === 'channel'
    ? overview.channels || []
    : secondaryDimension === 'platform'
      ? overview.platforms || []
      : [];
  for (const item of breakdownRows) {
    const key = String(item.dim_key || item.store_key || '');
    if (!key) continue;
    breakdown[key] = operationMetricsToOrderTotals(item.metrics);
    breakdownMetrics[key] = item.metrics;
  }
  return {
    totals,
    metrics: overview.metrics,
    breakdown,
    breakdownMetrics,
    avgOrderValueCent: moneyMetricToCent(overview.metrics.avg_order_value?.current),
    refundRate: Number(overview.metrics.refund_rate?.current ?? 0),
  };
}

export function buildOrderStoreSummary(rows: OrderStoreTableRow[]): OrderStoreTableSummary {
  const totals = emptyTotals();
  const breakdown: Record<string, OrderFactTotals> = {};
  for (const row of rows) {
    addTotals(totals, row.totals);
    for (const [key, values] of Object.entries(row.breakdown)) {
      breakdown[key] ||= emptyTotals();
      addTotals(breakdown[key], values);
    }
  }
  const metrics = orderComputedMetrics(totals);
  return {
    totals,
    breakdown,
    avgOrderValueCent: metrics.avg_order_value_cent,
    refundRate: metrics.refund_rate,
  };
}

function comparisonStatus(
  current: OrderFactTotals,
  previous: OrderFactTotals | null,
  previousValue: number | null,
): string {
  if (current.expected_days !== undefined
    && current.completed_days !== undefined
    && current.completed_days < current.expected_days) return 'incomplete_current';
  if (!previous) return 'missing_previous';
  if (previous.expected_days !== undefined
    && previous.completed_days !== undefined
    && previous.completed_days < previous.expected_days) return 'incomplete_previous';
  if (previousValue === 0) return 'zero_previous';
  return 'ok';
}

export function compareOrderMetrics(
  currentTotals: OrderFactTotals,
  previousTotals: OrderFactTotals | null,
): OrderMetricComparisons {
  const current = orderComputedMetrics(currentTotals);
  const previous = previousTotals ? orderComputedMetrics(previousTotals) : null;
  return Object.fromEntries(Object.keys(current).map((key) => {
    const metric = key as keyof OrderComputedMetrics;
    const currentValue = current[metric];
    const previousValue = previous?.[metric] ?? null;
    const status = comparisonStatus(currentTotals, previousTotals, previousValue);
    const difference = previousValue === null ? null : currentValue - previousValue;
    return [metric, {
      current: currentValue,
      previous: previousValue,
      difference,
      change_rate: status === 'ok' && previousValue !== null
        ? difference! / previousValue
        : null,
      status,
    } satisfies MetricComparison];
  })) as OrderMetricComparisons;
}

export function buildStorePeriodRows(
  facts: OrderDailyFact[],
  storeKey: string,
  granularity: TrendGranularity,
  dateFrom: string,
  dateTo: string,
): OrderStorePeriodRow[] {
  const storeFacts = filterOrderFactsByStores(facts, { storeKeys: [storeKey] });
  const periods = groupDailyFacts(storeFacts, granularity, true);
  return periods.flatMap((period, index) => {
    if (period.dateTo < dateFrom || period.dateFrom > dateTo) return [];
    const totals = aggregateOrderFacts(period.facts);
    const previousPeriod = periods[index - 1];
    const previousTotals = previousPeriod ? aggregateOrderFacts(previousPeriod.facts) : null;
    return [{
      key: period.key,
      period: period.key,
      label: period.label,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      totals,
      metrics: orderComputedMetrics(totals),
      comparison: compareOrderMetrics(totals, previousTotals),
      complete: period.complete,
    }];
  });
}
