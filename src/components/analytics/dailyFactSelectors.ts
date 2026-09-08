import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

import type { OrderDailyFact, OrderFactTotals, OrderStoreDailyFact } from '../../api/analyticsDailyTypes';
import type { TrendGranularity } from './trendPeriod';

dayjs.extend(isoWeek);

export type DatedFact<T> = T & { date: string; complete?: boolean };

export type FactPeriod<T> = {
  key: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  facts: DatedFact<T>[];
  complete: boolean;
  inProgress: boolean;
};

export type PeriodComparisonField = {
  current: number;
  previous: number;
  diff: number;
  percent: number;
};

export type PeriodComparison = {
  comparable: boolean;
  reason?: string;
} & Partial<Record<keyof OrderFactTotals, PeriodComparisonField>>;

export type OrderFactFilter = {
  storeKeys?: string[];
  sourceTypes?: string[];
  platformKeys?: string[];
};

export type RevenueSeriesPoint = OrderFactTotals & {
  period: string;
  date_from: string;
  date_to: string;
  missing: boolean;
  in_progress?: boolean;
  ma3?: number | null;
  ma4?: number | null;
  ma6?: number | null;
  ma7?: number | null;
  ma12?: number | null;
  ma26?: number | null;
  ma30?: number | null;
  ma180?: number | null;
};

const ZERO_TOTALS: OrderFactTotals = {
  order_count: 0,
  paid_amount_cent: 0,
  income_amount_cent: 0,
  refund_amount_cent: 0,
  net_amount_cent: 0,
  net_income_cent: 0,
  completed_days: 0,
  expected_days: 0,
};

const TOTAL_FIELDS = [
  'order_count',
  'paid_amount_cent',
  'income_amount_cent',
  'refund_amount_cent',
  'net_amount_cent',
  'net_income_cent',
] as const;

function cloneTotals(totals: Partial<OrderFactTotals> = {}): OrderFactTotals {
  return {
    ...ZERO_TOTALS,
    ...TOTAL_FIELDS.reduce((acc, field) => ({
      ...acc,
      [field]: Number(totals[field] || 0),
    }), {} as Pick<OrderFactTotals, typeof TOTAL_FIELDS[number]>),
    completed_days: totals.completed_days,
    expected_days: totals.expected_days,
  };
}

function addTotals(target: OrderFactTotals, source?: Partial<OrderFactTotals>): OrderFactTotals {
  if (!source) return target;
  for (const field of TOTAL_FIELDS) target[field] += Number(source[field] || 0);
  target.completed_days = (target.completed_days || 0) + Number(source.completed_days || 0);
  target.expected_days = (target.expected_days || 0) + Number(source.expected_days || 0);
  return target;
}

function totalsForStore(store: OrderStoreDailyFact, filter: Pick<OrderFactFilter, 'sourceTypes' | 'platformKeys'>): OrderFactTotals {
  const selectedSourceKeys = filter.sourceTypes?.filter(Boolean) || [];
  const selectedPlatformKeys = filter.platformKeys?.filter(Boolean) || [];
  if (selectedSourceKeys.length) {
    return selectedSourceKeys.reduce((sum, key) => addTotals(sum, store.source_totals?.[key]), cloneTotals());
  }
  if (selectedPlatformKeys.length) {
    return selectedPlatformKeys.reduce((sum, key) => addTotals(sum, store.platform_totals?.[key]), cloneTotals());
  }
  return cloneTotals(store);
}

function periodKey(date: string, granularity: TrendGranularity): string {
  const day = dayjs(date);
  if (granularity === 'week') return `${day.isoWeekYear()}-W${String(day.isoWeek()).padStart(2, '0')}`;
  if (granularity === 'month') return day.format('YYYY-MM');
  return date;
}

function periodBounds(date: string, granularity: TrendGranularity): [string, string] {
  const day = dayjs(date);
  if (granularity === 'week') return [day.startOf('isoWeek').format('YYYY-MM-DD'), day.endOf('isoWeek').format('YYYY-MM-DD')];
  if (granularity === 'month') return [day.startOf('month').format('YYYY-MM-DD'), day.endOf('month').format('YYYY-MM-DD')];
  return [date, date];
}

export function filterOrderFactsByStores(
  facts: OrderDailyFact[],
  filter: OrderFactFilter = {},
): OrderDailyFact[] {
  const selectedStores = new Set((filter.storeKeys || []).filter((key) => key && key !== 'ALL'));
  const useStoreFilter = selectedStores.size > 0;
  return facts.map((fact) => {
    const stores: Record<string, OrderStoreDailyFact> = {};
    const total = cloneTotals({ expected_days: 1, completed_days: fact.complete === false ? 0 : 1 });
    for (const [key, store] of Object.entries(fact.stores || {})) {
      if (useStoreFilter && !selectedStores.has(key) && !selectedStores.has(store.store_key)) continue;
      const selectedTotals = totalsForStore(store, filter);
      stores[key] = {
        ...store,
        ...selectedTotals,
      };
      addTotals(total, selectedTotals);
    }
    return {
      ...fact,
      ...total,
      stores,
    };
  });
}

export function aggregateOrderFacts(facts: OrderDailyFact[]): OrderFactTotals {
  const totals = cloneTotals();
  for (const fact of facts) {
    const storeValues = Object.values(fact.stores || {});
    if (storeValues.length) {
      for (const store of storeValues) addTotals(totals, store);
    } else {
      for (const field of TOTAL_FIELDS) totals[field] += Number(fact[field] || 0);
    }
    totals.completed_days = (totals.completed_days || 0) + (fact.complete === false ? 0 : 1);
    totals.expected_days = (totals.expected_days || 0) + 1;
  }
  return totals;
}

export function groupDailyFacts<T>(
  facts: DatedFact<T>[],
  granularity: TrendGranularity,
  includeCurrent: boolean,
  expectedDateFrom?: string,
  expectedDateTo?: string,
): FactPeriod<T>[] {
  const grouped = new Map<string, FactPeriod<T>>();
  const scopedFacts = facts.filter(fact => (
    (!expectedDateFrom || fact.date >= expectedDateFrom)
    && (!expectedDateTo || fact.date <= expectedDateTo)
  ));
  const ensurePeriod = (date: string): FactPeriod<T> => {
    const key = periodKey(date, granularity);
    const [dateFrom, dateTo] = periodBounds(date, granularity);
    const current = grouped.get(key) || {
      key,
      label: granularity === 'day' ? date : `${dateFrom} 至 ${dateTo}`,
      dateFrom,
      dateTo,
      facts: [],
      complete: true,
      inProgress: false,
    };
    grouped.set(key, current);
    return current;
  };
  for (const fact of [...scopedFacts].sort((a, b) => a.date.localeCompare(b.date))) {
    const current = ensurePeriod(fact.date);
    current.facts.push(fact);
    current.dateFrom = current.dateFrom < fact.date ? current.dateFrom : fact.date;
    current.dateTo = current.dateTo > fact.date ? current.dateTo : fact.date;
    current.complete = current.complete && fact.complete !== false;
  }
  if (expectedDateFrom && expectedDateTo) {
    const presentDates = new Set(scopedFacts.map(fact => fact.date));
    let currentDate = dayjs(expectedDateFrom);
    const lastDate = dayjs(expectedDateTo);
    if (currentDate.isValid() && lastDate.isValid() && !currentDate.isAfter(lastDate, 'day')) {
      while (!currentDate.isAfter(lastDate, 'day')) {
        const date = currentDate.format('YYYY-MM-DD');
        if (!presentDates.has(date)) ensurePeriod(date).complete = false;
        currentDate = currentDate.add(1, 'day');
      }
    }
    if (granularity !== 'day') {
      const expectedStart = dayjs(expectedDateFrom);
      const expectedEnd = dayjs(expectedDateTo);
      for (const period of grouped.values()) {
        if (expectedStart.isAfter(period.dateFrom, 'day') && !expectedStart.isAfter(period.dateTo, 'day')) {
          period.complete = false;
        }
        if (expectedEnd.isBefore(period.dateTo, 'day') && !expectedEnd.isBefore(period.dateFrom, 'day')) {
          period.inProgress = true;
        }
      }
    }
  }
  return [...grouped.values()]
    .sort((left, right) => left.dateFrom.localeCompare(right.dateFrom))
    .filter((period) => includeCurrent || (period.complete && !period.inProgress));
}

export function compareFactPeriods(
  current: OrderFactTotals,
  previous: OrderFactTotals | null,
): PeriodComparison {
  const incomparable = { comparable: false, reason: '上期数据不全，比例不可比' };
  if (!previous || previous.net_income_cent === 0) return incomparable;
  if (previous.expected_days !== undefined && previous.completed_days !== undefined && previous.completed_days < previous.expected_days) {
    return incomparable;
  }
  const comparison: PeriodComparison = { comparable: true };
  for (const field of TOTAL_FIELDS) {
    const previousValue = Number(previous[field] || 0);
    const currentValue = Number(current[field] || 0);
    comparison[field] = {
      current: currentValue,
      previous: previousValue,
      diff: currentValue - previousValue,
      percent: previousValue === 0 ? 0 : (currentValue - previousValue) / previousValue,
    };
  }
  return comparison;
}

export function movingAverage(
  values: Array<number | null | undefined>,
  window: number,
  requireCompleteWindow = true,
): Array<number | null> {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1);
    if (requireCompleteWindow && (slice.length < window || slice.some((value) => value === null || value === undefined))) return null;
    const available = slice.filter((value): value is number => value !== null && value !== undefined);
    if (!available.length) return null;
    return Math.round(available.reduce((sum, value) => sum + value, 0) / available.length);
  });
}

export function buildRevenueSeries(
  facts: OrderDailyFact[],
  granularity: TrendGranularity,
  includeCurrent: boolean,
  expectedDateFrom?: string,
  expectedDateTo?: string,
): RevenueSeriesPoint[] {
  const periods = groupDailyFacts<OrderDailyFact>(
    facts,
    granularity,
    true,
    expectedDateFrom,
    expectedDateTo,
  );
  const points: RevenueSeriesPoint[] = periods.map((period) => ({
    period: period.key,
    date_from: period.dateFrom,
    date_to: period.dateTo,
    missing: !period.complete,
    ...(period.inProgress ? { in_progress: true } : {}),
    ...aggregateOrderFacts(period.facts),
  }));
  const values = points.map((point) => point.missing || point.in_progress ? null : point.net_income_cent);
  const maFields = granularity === 'week'
    ? [['ma4', 4], ['ma12', 12], ['ma26', 26]] as const
    : granularity === 'month'
      ? [['ma3', 3], ['ma6', 6], ['ma12', 12]] as const
      : [['ma7', 7], ['ma30', 30], ['ma180', 180]] as const;
  for (const [field, window] of maFields) {
    const averages = movingAverage(values, window, granularity !== 'day');
    points.forEach((point, index) => {
      point[field] = averages[index];
    });
  }
  return includeCurrent ? points : points.filter((point) => !point.missing && !point.in_progress);
}
