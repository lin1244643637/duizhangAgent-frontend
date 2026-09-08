import { describe, expect, it } from 'vitest';
import type {
  MealPeriodKey,
  MealPeriodRow,
  MealPeriodTrendPoint,
  MealPeriodTurnoverPoint,
  MealPeriodTurnoverResult,
} from '../../api/analytics';
import {
  buildLaborScopeTrendSeries,
  buildMealScopeTrendSeries,
  buildMealTurnoverScopeTrendSeries,
  buildScopeProductTrendSeries,
  buildScopeTrendSeries,
} from './scopeTrendSeries';

const mealKeys: MealPeriodKey[] = ['breakfast', 'lunch', 'afternoon_tea', 'dinner', 'late_night'];

function mealPoint(date: string, netIncome: number, orderCount: number): MealPeriodTrendPoint {
  return {
    date,
    ...Object.fromEntries(mealKeys.map(periodKey => [periodKey, {
      period_key: periodKey,
      period_label: periodKey,
      order_count: orderCount,
      paid_amount: netIncome,
      income_amount: netIncome,
      refund_amount: 0,
      net_income: netIncome,
      avg_order_value: orderCount ? netIncome / orderCount : 0,
      ma7: netIncome,
      ma30: netIncome,
      ma180: netIncome,
    } satisfies MealPeriodRow])),
  } as MealPeriodTrendPoint;
}

function turnoverPoint(date: string, orderCount: number, tableCount: number): MealPeriodTurnoverPoint {
  return {
    date,
    ...Object.fromEntries(mealKeys.map(periodKey => [periodKey, {
      shop_order_count: orderCount,
      turnover: orderCount / tableCount,
      ma7: orderCount / tableCount,
      ma30: orderCount / tableCount,
      ma180: orderCount / tableCount,
    }])),
  } as MealPeriodTurnoverPoint;
}

describe('buildScopeTrendSeries', () => {
  it('aggregates scope money in integer cents', () => {
    const scopes = [{ key: 'dept:11', label: '事业1部', storeKeys: ['801', '802'], departmentKeys: ['111', '112'] }];

    expect(buildScopeTrendSeries(scopes, {
      '801': [{ period: '2026-07-01', net_income: 0.1, order_count: 1, missing: false }],
      '802': [{ period: '2026-07-01', net_income: 0.2, order_count: 2, missing: false }],
    })['dept:11'][0]).toMatchObject({ net_income: 0.3, order_count: 3 });

    expect(buildMealScopeTrendSeries(scopes, {
      '801': [mealPoint('2026-07-01', 0.1, 1)],
      '802': [mealPoint('2026-07-01', 0.2, 2)],
    })['dept:11'][0].lunch).toMatchObject({
      paid_amount: 0.3,
      income_amount: 0.3,
      refund_amount: 0,
      net_income: 0.3,
      order_count: 3,
    });

    expect(buildScopeProductTrendSeries(scopes, {
      '801': [{ period: '2026-07-01', quantity: 1, sales_amount: 0.1, order_count: 1, missing: false }],
      '802': [{ period: '2026-07-01', quantity: 2, sales_amount: 0.2, order_count: 2, missing: false }],
    })['dept:11'][0]).toMatchObject({ sales_amount: 0.3, quantity: 3, order_count: 3 });

    expect(buildLaborScopeTrendSeries(scopes, {
      '111': [{ period: '2026-W27', net_revenue: 0.1, actual_hours: 1, planned_hours: 2, actual_revenue_per_hour: 0.1, planned_revenue_per_hour: 0.05, headcount: 1, missing: false }],
      '112': [{ period: '2026-W27', net_revenue: 0.2, actual_hours: 2, planned_hours: 3, actual_revenue_per_hour: 0.1, planned_revenue_per_hour: 0.2 / 3, headcount: 2, missing: false }],
    })['dept:11'][0]).toMatchObject({ net_revenue: 0.3, actual_hours: 3, planned_hours: 5, headcount: 3 });
  });

  it('aggregates an explicit department while retaining an explicit child store', () => {
    const scopes = [
      { key: 'dept:11', label: '事业1部', storeKeys: ['801', '802'] },
      { key: 'shop:801', label: '凤八店', storeKeys: ['801'] },
    ];
    const trends = {
      '801': [{ period: '2026-07-01', net_income: 100, order_count: 10, missing: false }],
      '802': [{ period: '2026-07-01', net_income: 200, order_count: 20, missing: false }],
    };

    expect(buildScopeTrendSeries(scopes, trends)).toEqual({
      'dept:11': [{
        period: '2026-07-01',
        net_income: 300,
        order_count: 30,
        ma7: null,
        ma30: null,
        ma180: null,
        missing: false,
      }],
      'shop:801': [{
        period: '2026-07-01',
        net_income: 100,
        order_count: 10,
        missing: false,
      }],
    });
  });

  it('builds independent meal lines for an explicit department and child store', () => {
    const scopes = [
      { key: 'dept:11', label: '事业1部', storeKeys: ['801', '802'] },
      { key: 'shop:801', label: '凤八店', storeKeys: ['801'] },
    ];

    const result = buildMealScopeTrendSeries(scopes, {
      '801': [mealPoint('2026-07-21', 100, 10)],
      '802': [mealPoint('2026-07-21', 200, 20)],
    });

    expect(result['dept:11'][0].lunch).toMatchObject({
      net_income: 300,
      order_count: 30,
      ma7: 300,
      ma30: 300,
      ma180: 300,
    });
    expect(result['shop:801'][0].lunch.net_income).toBe(100);
  });

  it('weights an explicit department turnover line by its total table count', () => {
    const scopes = [
      { key: 'dept:11', label: '事业1部', storeKeys: ['801', '802'] },
      { key: 'shop:801', label: '凤八店', storeKeys: ['801'] },
    ];
    const turnover: MealPeriodTurnoverResult = {
      data_status: 'ok',
      date_from: '2026-07-21',
      date_to: '2026-07-21',
      day_count: 1,
      eligible_store_count: 2,
      table_count: 40,
      excluded_stores: [],
      summary: [],
      points: [],
      store_summaries: [
        { store_key: '801', store_label: '凤八店', table_count: 10, summary: [] },
        { store_key: '802', store_label: '阳光荟', table_count: 30, summary: [] },
      ],
      store_trends: {
        '801': [turnoverPoint('2026-07-21', 20, 10)],
        '802': [turnoverPoint('2026-07-21', 30, 30)],
      },
    };

    const result = buildMealTurnoverScopeTrendSeries(scopes, turnover);

    expect(result['dept:11'][0].lunch).toMatchObject({
      shop_order_count: 50,
      turnover: 1.25,
      ma7: 1.25,
      ma30: 1.25,
      ma180: 1.25,
    });
    expect(result['shop:801'][0].lunch.turnover).toBe(2);
  });

  it('builds independent product and labor lines for an explicit parent and child', () => {
    const scopes = [
      { key: 'dept:11', label: '事业1部', storeKeys: ['801', '802'], departmentKeys: ['111', '112'] },
      { key: 'shop:801', label: '北大街', storeKeys: ['801'], departmentKeys: ['111'] },
    ];

    expect(buildScopeProductTrendSeries(scopes, {
      '801': [{ period: '2026-07-01', quantity: 2, sales_amount: 20, order_count: 2, missing: false }],
      '802': [{ period: '2026-07-01', quantity: 3, sales_amount: 30, order_count: 3, missing: false }],
    })).toMatchObject({
      'dept:11': [{ period: '2026-07-01', quantity: 5, sales_amount: 50, order_count: 5 }],
      'shop:801': [{ period: '2026-07-01', quantity: 2, sales_amount: 20, order_count: 2 }],
    });

    expect(buildLaborScopeTrendSeries(scopes, {
      '111': [{ period: '2026-W27', net_revenue: 100, actual_hours: 4, planned_hours: 5, actual_revenue_per_hour: 25, planned_revenue_per_hour: 20, headcount: 1, missing: false }],
      '112': [{ period: '2026-W27', net_revenue: 200, actual_hours: 10, planned_hours: 8, actual_revenue_per_hour: 20, planned_revenue_per_hour: 25, headcount: 2, missing: false }],
    })).toMatchObject({
      'dept:11': [{ period: '2026-W27', net_revenue: 300, actual_hours: 14, planned_hours: 13, actual_revenue_per_hour: 300 / 14, planned_revenue_per_hour: 300 / 13 }],
      'shop:801': [{ period: '2026-W27', net_revenue: 100, actual_hours: 4, planned_hours: 5 }],
    });
  });
});
