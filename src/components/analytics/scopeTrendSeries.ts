import type {
  LaborTrendPoint,
  MealPeriodKey,
  MealPeriodTrendPoint,
  MealPeriodTurnoverPoint,
  MealPeriodTurnoverResult,
  ProductTrendPoint,
  RevenueTrendPoint,
} from '../../api/analytics';
import { addMoney, sumMoney } from '../../utils/money';
import { selectedStoreTrendMap } from './multiStoreSeries';
import type { ExplicitStoreScope } from './storeScope';

export const MEAL_PERIOD_SERIES: Array<[MealPeriodKey, string]> = [
  ['breakfast', '早餐'],
  ['lunch', '午餐'],
  ['afternoon_tea', '下午茶'],
  ['dinner', '晚餐'],
  ['late_night', '夜宵'],
];

const MEAL_MOVING_AVERAGE_FIELDS = ['ma3', 'ma4', 'ma6', 'ma7', 'ma12', 'ma26', 'ma30', 'ma180'] as const;

export function buildScopeTrendSeries(
  scopes: ExplicitStoreScope[],
  storeTrends: Record<string, RevenueTrendPoint[]>,
): Record<string, RevenueTrendPoint[]> {
  return Object.fromEntries(scopes.map(scope => [scope.key, buildScopePoints(scope, storeTrends)]));
}

function buildScopePoints(
  scope: ExplicitStoreScope,
  storeTrends: Record<string, RevenueTrendPoint[]>,
): RevenueTrendPoint[] {
  if (scope.storeKeys.length === 1) return storeTrends[scope.storeKeys[0]] || [];

  const periods = [...new Set(scope.storeKeys.flatMap(key =>
    (storeTrends[key] || []).map(point => point.period),
  ))].sort();

  return periods.map(period => {
    const points = scope.storeKeys.map(key =>
      (storeTrends[key] || []).find(point => point.period === period),
    );
    return {
      period,
      net_income: sumMoney(points.map(point => point?.net_income)),
      order_count: points.reduce((total, point) => total + (point?.order_count || 0), 0),
      ma7: null,
      ma30: null,
      ma180: null,
      missing: points.some(point => !point || point.missing),
      ...(points.some(point => point?.in_progress) ? { in_progress: true } : {}),
    };
  });
}

export function buildMealScopeTrendSeries(
  scopes: ExplicitStoreScope[],
  storeTrends: Record<string, MealPeriodTrendPoint[]>,
): Record<string, MealPeriodTrendPoint[]> {
  return Object.fromEntries(scopes.map(scope => [
    scope.key,
    selectMealStorePoints([], storeTrends, scope.storeKeys),
  ]));
}

export function selectMealStorePoints(
  allPoints: MealPeriodTrendPoint[],
  storeTrends: Record<string, MealPeriodTrendPoint[]>,
  keys: string[],
): MealPeriodTrendPoint[] {
  if (keys.length === 0) return allPoints;
  if (keys.length === 1) return storeTrends[keys[0]] || [];
  const selected = selectedStoreTrendMap(storeTrends, keys);
  const dates = [...new Set(Object.values(selected).flatMap(points => points.map(point => point.date)))].sort();
  return dates.map(date => {
    const points = Object.values(selected)
      .map(rows => rows.find(point => point.date === date))
      .filter((point): point is MealPeriodTrendPoint => Boolean(point));
    return {
      date,
      ...Object.fromEntries(MEAL_PERIOD_SERIES.map(([periodKey, periodLabel]) => {
        const rows = points.map(point => point[periodKey]);
        const orderCount = rows.reduce((total, row) => total + Number(row.order_count || 0), 0);
        const paidAmount = sumMoney(rows.map(row => row.paid_amount));
        const incomeAmount = sumMoney(rows.map(row => row.income_amount));
        const refundAmount = sumMoney(rows.map(row => row.refund_amount));
        const sumAverage = (field: typeof MEAL_MOVING_AVERAGE_FIELDS[number]) => rows.every(row => typeof row[field] === 'number')
          ? sumMoney(rows.map(row => row[field]))
          : null;
        return [periodKey, {
          period_key: periodKey,
          period_label: periodLabel,
          order_count: orderCount,
          paid_amount: paidAmount,
          income_amount: incomeAmount,
          refund_amount: refundAmount,
          net_income: addMoney(incomeAmount, -refundAmount),
          avg_order_value: orderCount ? paidAmount / orderCount : 0,
          ...Object.fromEntries(MEAL_MOVING_AVERAGE_FIELDS.map(field => [field, sumAverage(field)])),
        }];
      })),
    } as MealPeriodTrendPoint;
  });
}

export function buildMealTurnoverScopeTrendSeries(
  scopes: ExplicitStoreScope[],
  result: MealPeriodTurnoverResult,
): Record<string, MealPeriodTurnoverPoint[]> {
  return Object.fromEntries(scopes.map(scope => [
    scope.key,
    selectMealTurnover(result, scope.storeKeys)?.points || [],
  ]));
}

export function selectMealTurnover(
  result: MealPeriodTurnoverResult | null,
  storeKeys: string[],
): MealPeriodTurnoverResult | null {
  if (!result || storeKeys.length === 0) return result;
  const selectedSummaries = result.store_summaries.filter(store => storeKeys.includes(store.store_key));
  const tableCount = selectedSummaries.reduce((sum, store) => sum + Number(store.table_count || 0), 0);
  const tableCountByStore = new Map(selectedSummaries.map(store => [store.store_key, Number(store.table_count || 0)]));
  const selectedTrends = selectedStoreTrendMap(result.store_trends || {}, storeKeys);
  const points = storeKeys.length === 1
    ? selectedTrends[storeKeys[0]] || []
    : [...new Set(Object.values(selectedTrends).flatMap(rows => rows.map(point => point.date)))].sort().map(date => ({
        date,
        ...Object.fromEntries(MEAL_PERIOD_SERIES.map(([periodKey]) => {
          const storePoints = Object.entries(selectedTrends).map(([storeKey, rows]) => ({
            storeKey,
            point: rows.find(item => item.date === date),
          }));
          const orderCount = storePoints.reduce((sum, { point }) => {
            return sum + Number(point?.[periodKey].shop_order_count || 0);
          }, 0);
          const weightedAverage = (field: typeof MEAL_MOVING_AVERAGE_FIELDS[number]) => {
            if (!tableCount || storePoints.some(({ point }) => typeof point?.[periodKey][field] !== 'number')) return null;
            return Number((storePoints.reduce((sum, { storeKey, point }) => (
              sum + Number(point?.[periodKey][field] || 0) * Number(tableCountByStore.get(storeKey) || 0)
            ), 0) / tableCount).toFixed(2));
          };
          return [periodKey, {
            shop_order_count: orderCount,
            turnover: tableCount ? Number((orderCount / tableCount).toFixed(2)) : 0,
            ...Object.fromEntries(MEAL_MOVING_AVERAGE_FIELDS.map(field => [field, weightedAverage(field)])),
          }];
        })),
      } as MealPeriodTurnoverPoint));
  const summary = MEAL_PERIOD_SERIES.map(([periodKey, periodLabel]) => {
    const orderCount = selectedSummaries.reduce((sum, store) => {
      const row = store.summary.find(item => item.period_key === periodKey);
      return sum + Number(row?.shop_order_count || 0);
    }, 0);
    return {
      period_key: periodKey,
      period_label: periodLabel,
      shop_order_count: orderCount,
      avg_daily_turnover: tableCount && result.day_count
        ? Number((orderCount / result.day_count / tableCount).toFixed(2))
        : 0,
    };
  });
  return {
    ...result,
    data_status: selectedSummaries.length ? 'ok' : 'missing',
    eligible_store_count: selectedSummaries.length,
    table_count: tableCount,
    excluded_stores: result.excluded_stores.filter(store => storeKeys.includes(store.store_key)),
    summary,
    points,
    store_summaries: selectedSummaries,
    store_trends: selectedTrends,
  };
}

export function buildScopeProductTrendSeries(
  scopes: ExplicitStoreScope[],
  storeTrends: Record<string, ProductTrendPoint[]>,
): Record<string, ProductTrendPoint[]> {
  return Object.fromEntries(scopes.map(scope => [
    scope.key,
    buildProductScopePoints(scope.storeKeys, storeTrends),
  ]));
}

function buildProductScopePoints(
  keys: string[],
  storeTrends: Record<string, ProductTrendPoint[]>,
): ProductTrendPoint[] {
  if (keys.length === 1) return storeTrends[keys[0]] || [];
  const periods = [...new Set(keys.flatMap(key => (storeTrends[key] || []).map(point => point.period)))].sort();
  return periods.map(period => {
    const points = keys.map(key => (storeTrends[key] || []).find(point => point.period === period));
    return {
      period,
      quantity: points.reduce((total, point) => total + Number(point?.quantity || 0), 0),
      sales_amount: sumMoney(points.map(point => point?.sales_amount)),
      order_count: points.reduce((total, point) => total + Number(point?.order_count || 0), 0),
      missing: points.some(point => !point || point.missing),
    };
  });
}

export function buildLaborScopeTrendSeries(
  scopes: ExplicitStoreScope[],
  storeTrends: Record<string, LaborTrendPoint[]>,
): Record<string, LaborTrendPoint[]> {
  return Object.fromEntries(scopes.map(scope => [
    scope.key,
    buildLaborScopePoints(scope.departmentKeys || scope.storeKeys, storeTrends),
  ]));
}

function buildLaborScopePoints(
  keys: string[],
  storeTrends: Record<string, LaborTrendPoint[]>,
): LaborTrendPoint[] {
  if (keys.length === 1) return storeTrends[keys[0]] || [];
  const periods = [...new Set(keys.flatMap(key => (storeTrends[key] || []).map(point => point.period)))].sort();
  return periods.map(period => {
    const points = keys.map(key => (storeTrends[key] || []).find(point => point.period === period));
    const netRevenue = sumMoney(points.map(point => point?.net_revenue));
    const actualHours = points.reduce((total, point) => total + Number(point?.actual_hours || 0), 0);
    const plannedHours = points.reduce((total, point) => total + Number(point?.planned_hours || 0), 0);
    return {
      period,
      net_revenue: netRevenue,
      actual_hours: actualHours,
      planned_hours: plannedHours,
      actual_revenue_per_hour: actualHours ? netRevenue / actualHours : 0,
      planned_revenue_per_hour: plannedHours ? netRevenue / plannedHours : 0,
      headcount: points.reduce((total, point) => total + Number(point?.headcount || 0), 0),
      missing: points.some(point => !point || point.missing),
    };
  });
}
