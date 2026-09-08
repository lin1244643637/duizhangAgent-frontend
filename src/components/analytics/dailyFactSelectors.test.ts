import { describe, expect, it } from 'vitest';

import type { OrderDailyFact } from '../../api/analyticsDailyTypes';
import {
  aggregateOrderFacts,
  buildRevenueSeries,
  compareFactPeriods,
  filterOrderFactsByStores,
  groupDailyFacts,
  movingAverage,
} from './dailyFactSelectors';

function totals(netIncomeCent: number, orderCount = 1) {
  return {
    order_count: orderCount,
    paid_amount_cent: netIncomeCent,
    income_amount_cent: netIncomeCent,
    refund_amount_cent: 0,
    net_amount_cent: netIncomeCent,
    net_income_cent: netIncomeCent,
  };
}

function orderFacts(rows: Array<[string, number]>): OrderDailyFact[] {
  return rows.map(([date, netIncomeCent]) => ({
    date,
    ...totals(netIncomeCent),
    stores: {
      S1: {
        store_key: 'S1',
        store_label: '门店1',
        ...totals(netIncomeCent),
        source_totals: {
          shop: totals(Math.round(netIncomeCent * 0.6)),
          takeout: totals(Math.round(netIncomeCent * 0.4)),
        },
      },
    },
  }));
}

describe('dailyFactSelectors', () => {
  it('aggregates cents and recomputes MA without changing cached facts', () => {
    const facts = orderFacts([
      ['2026-08-01', 1001],
      ['2026-08-02', 1002],
      ['2026-08-03', 1003],
    ]);

    expect(aggregateOrderFacts(facts).net_income_cent).toBe(3006);
    expect(movingAverage([1001, 1002, 1003], 3)).toEqual([null, null, 1002]);
    expect(facts[0].stores.S1.net_income_cent).toBe(1001);
  });

  it('counts a complete zero-order day exactly once', () => {
    const facts: OrderDailyFact[] = [{
      date: '2026-08-01',
      complete: true,
      ...totals(0, 0),
      completed_days: 1,
      expected_days: 1,
      stores: {},
    }];

    expect(aggregateOrderFacts(facts)).toMatchObject({
      completed_days: 1,
      expected_days: 1,
    });
  });

  it('groups days by ISO week and drops incomplete current periods unless requested', () => {
    const facts = orderFacts([
      ['2026-08-03', 1000],
      ['2026-08-04', 2000],
      ['2026-08-10', 3000],
    ]);
    facts[2].complete = false;

    expect(groupDailyFacts(facts, 'week', false)).toMatchObject([
      {
        key: '2026-W32',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-09',
        facts: [{ date: '2026-08-03' }, { date: '2026-08-04' }],
      },
    ]);
    expect(groupDailyFacts(facts, 'week', true).map(period => period.key)).toEqual(['2026-W32', '2026-W33']);
  });

  it('marks a period incomplete when an expected calendar day is absent', () => {
    const facts = orderFacts([
      ['2026-08-03', 1000],
      ['2026-08-05', 3000],
    ]);

    expect(groupDailyFacts(facts, 'week', false, '2026-08-03', '2026-08-05')).toEqual([]);
    expect(groupDailyFacts(facts, 'week', true, '2026-08-03', '2026-08-05')).toMatchObject([
      {
        key: '2026-W32',
        complete: false,
        facts: [{ date: '2026-08-03' }, { date: '2026-08-05' }],
      },
    ]);
  });

  it('marks previous zero or incomplete periods as not comparable', () => {
    const current = aggregateOrderFacts(orderFacts([['2026-08-03', 1000]]));
    expect(compareFactPeriods(current, null)).toMatchObject({
      comparable: false,
      reason: '上期数据不全，比例不可比',
    });
    expect(compareFactPeriods(current, { ...totals(0), completed_days: 1, expected_days: 1 })).toMatchObject({
      comparable: false,
      reason: '上期数据不全，比例不可比',
    });
    expect(compareFactPeriods(current, { ...totals(500), completed_days: 0, expected_days: 1 })).toMatchObject({
      comparable: false,
      reason: '上期数据不全，比例不可比',
    });
    expect(compareFactPeriods(current, { ...totals(500), completed_days: 1, expected_days: 1 })).toMatchObject({
      comparable: true,
      net_income_cent: { diff: 500, percent: 1 },
    });
  });

  it('filters selected stores and channels without mutating source facts', () => {
    const facts: OrderDailyFact[] = [{
      date: '2026-08-01',
      ...totals(3000, 3),
      stores: {
        S1: { store_key: 'S1', store_label: '门店1', ...totals(1000, 1), source_totals: { shop: totals(600), takeout: totals(400) } },
        S2: { store_key: 'S2', store_label: '门店2', ...totals(2000, 2), source_totals: { shop: totals(1200), takeout: totals(800) } },
      },
    }];

    const filtered = filterOrderFactsByStores(facts, { storeKeys: ['S2'], sourceTypes: ['takeout'] });

    expect(aggregateOrderFacts(filtered)).toMatchObject({
      net_income_cent: 800,
      order_count: 1,
    });
    expect(facts[0].stores.S2.net_income_cent).toBe(2000);
  });

  it('builds revenue series from grouped order facts', () => {
    const series = buildRevenueSeries(orderFacts([
      ['2026-08-01', 1000],
      ['2026-08-02', 1100],
      ['2026-08-03', 1200],
      ['2026-08-04', 1300],
      ['2026-08-05', 1400],
      ['2026-08-06', 1500],
      ['2026-08-07', 1600],
    ]), 'day', true);

    expect(series.map(point => point.net_income_cent)).toEqual([1000, 1100, 1200, 1300, 1400, 1500, 1600]);
    expect(series[6].ma7).toBe(1300);
  });

  it('uses available values for daily moving averages', () => {
    expect(movingAverage([1000, null, 2000], 7, false)).toEqual([1000, 1000, 1500]);
  });

  it('calculates MA180 after loading the full daily history window', () => {
    const facts = Array.from({ length: 180 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 1, 4 + index));
      return [date.toISOString().slice(0, 10), 1000 + index] as [string, number];
    });
    const series = buildRevenueSeries(orderFacts(facts), 'day', true);

    expect(series).toHaveLength(180);
    expect(series[series.length - 1]?.ma180).toBe(1090);
  });

  it('calculates complete weekly and monthly moving-average windows from hidden history', () => {
    const rows: Array<[string, number]> = [];
    for (
      let cursor = new Date(Date.UTC(2025, 3, 7));
      cursor <= new Date(Date.UTC(2026, 7, 2));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    ) {
      rows.push([cursor.toISOString().slice(0, 10), 1000]);
    }

    const weekly = buildRevenueSeries(orderFacts(rows), 'week', false, '2025-04-07', '2026-08-02');
    const monthly = buildRevenueSeries(orderFacts(rows), 'month', false, '2025-04-07', '2026-07-31');

    expect(weekly[weekly.length - 1]?.ma26).toBe(7000);
    expect(monthly[monthly.length - 1]?.ma12).toBeGreaterThan(28000);
  });

  it('marks an unfinished current week in progress and excludes it from MA26', () => {
    const rows: Array<[string, number]> = [];
    for (
      let cursor = new Date(Date.UTC(2026, 1, 9));
      cursor <= new Date(Date.UTC(2026, 7, 11));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    ) {
      rows.push([cursor.toISOString().slice(0, 10), 1000]);
    }

    const series = buildRevenueSeries(orderFacts(rows), 'week', true, '2026-02-09', '2026-08-11');

    expect(series[series.length - 2]?.ma26).toBe(7000);
    expect(series[series.length - 1]).toMatchObject({
      in_progress: true,
      ma26: null,
    });
  });

  it('marks an unfinished current month in progress and excludes it from MA12', () => {
    const rows: Array<[string, number]> = [];
    for (
      let cursor = new Date(Date.UTC(2025, 6, 1));
      cursor <= new Date(Date.UTC(2026, 7, 11));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    ) {
      rows.push([cursor.toISOString().slice(0, 10), 1000]);
    }

    const series = buildRevenueSeries(orderFacts(rows), 'month', true, '2025-07-01', '2026-08-11');

    expect(series[series.length - 2]?.ma12).not.toBeNull();
    expect(series[series.length - 1]).toMatchObject({
      in_progress: true,
      ma12: null,
    });
  });

  it('keeps missing calendar days ordered and excludes them from moving averages', () => {
    const series = buildRevenueSeries(orderFacts([
      ['2026-08-01', 1000],
      ['2026-08-02', 1100],
      ['2026-08-03', 1200],
      ['2026-08-05', 1400],
      ['2026-08-06', 1500],
      ['2026-08-07', 1600],
    ]), 'day', true, '2026-08-01', '2026-08-07');

    expect(series.map(point => point.period)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
    expect(series[3]).toMatchObject({ missing: true, net_income_cent: 0 });
    expect(series[6].ma7).toBe(1300);
  });

  it('hides incomplete days only after moving averages are calculated', () => {
    const series = buildRevenueSeries(orderFacts([
      ['2026-08-01', 1000],
      ['2026-08-02', 1100],
      ['2026-08-03', 1200],
      ['2026-08-05', 1400],
      ['2026-08-06', 1500],
      ['2026-08-07', 1600],
      ['2026-08-08', 1700],
    ]), 'day', false, '2026-08-01', '2026-08-08');

    expect(series.map(point => point.period)).not.toContain('2026-08-04');
    expect(series[series.length - 1]?.ma7).toBe(1417);
  });
});
