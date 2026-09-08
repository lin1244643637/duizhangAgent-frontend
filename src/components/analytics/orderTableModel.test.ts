import { describe, expect, it } from 'vitest';

import type { OrderDailyFact, OrderFactTotals } from '../../api/analyticsDailyTypes';
import {
  buildOrderStoreRows,
  buildOrderStoreRowsFromLegacy,
  buildOrderStoreSummary,
  buildStorePeriodRows,
  compareOrderMetrics,
  collectOrderBreakdownKeys,
} from './orderTableModel';

const totals = (
  orderCount: number,
  paid: number,
  income: number,
  refund: number,
): OrderFactTotals => ({
  order_count: orderCount,
  paid_amount_cent: paid,
  income_amount_cent: income,
  refund_amount_cent: refund,
  net_amount_cent: paid - refund,
  net_income_cent: income - refund,
});

function fact(
  date: string,
  stores: OrderDailyFact['stores'],
  complete = true,
): OrderDailyFact {
  return {
    date,
    complete,
    ...totals(0, 0, 0, 0),
    stores,
  };
}

describe('orderTableModel', () => {
  it('keeps one row per store and exposes channel totals as nested values', () => {
    const facts = [fact('2026-08-01', {
      A: {
        store_key: 'A',
        store_label: '凤八店',
        ...totals(5, 6000, 5500, 500),
        source_totals: {
          shop: totals(3, 4000, 3600, 400),
          takeout: totals(2, 2000, 1900, 100),
        },
      },
    })];

    const rows = buildOrderStoreRows(facts, 'channel');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      storeKey: 'A',
      storeLabel: '凤八店',
      totals: { order_count: 5, net_income_cent: 5000 },
      breakdown: {
        shop: { order_count: 3, net_income_cent: 3200 },
        takeout: { order_count: 2, net_income_cent: 1800 },
      },
    });
  });

  it('collects stable dynamic platform columns and leaves unknown names to the UI fallback', () => {
    const facts = [fact('2026-08-01', {
      A: {
        store_key: 'A',
        ...totals(2, 2000, 1800, 0),
        platform_totals: {
          '4': totals(1, 1000, 900, 0),
          '0': totals(1, 1000, 900, 0),
        },
      },
    })];

    expect(collectOrderBreakdownKeys(facts, 'platform')).toEqual(['0', '4']);
    expect(collectOrderBreakdownKeys(facts, 'channel')).toEqual(['shop', 'takeout']);
  });

  it('recomputes total average order value and refund rate from additive totals', () => {
    const rows = buildOrderStoreRows([fact('2026-08-01', {
      A: { store_key: 'A', ...totals(2, 3000, 2800, 300) },
      B: { store_key: 'B', ...totals(3, 5000, 4700, 500) },
    })], 'none');

    const summary = buildOrderStoreSummary(rows);

    expect(summary.totals).toMatchObject({
      order_count: 5,
      paid_amount_cent: 8000,
      income_amount_cent: 7500,
      refund_amount_cent: 800,
      net_income_cent: 6700,
    });
    expect(summary.avgOrderValueCent).toBe(1340);
    expect(summary.refundRate).toBe(0.1);
  });

  it('pivots legacy split rows back into one store row for the fallback path', () => {
    const rows = buildOrderStoreRowsFromLegacy([
      {
        dim_key: 'A|shop', dim_label: '凤八店 · 堂食', source_type: 'shop',
        order_count: 3, paid_amount: 40, income_amount: 36, refund_amount: 4,
        net_amount: 36, net_income: 32, avg_order_value: 10.67, refund_rate: 0.1,
        computed_at: null,
      },
      {
        dim_key: 'A|takeout', dim_label: '凤八店 · 外卖', source_type: 'takeout',
        order_count: 2, paid_amount: 20, income_amount: 19, refund_amount: 1,
        net_amount: 19, net_income: 18, avg_order_value: 9, refund_rate: 0.05,
        computed_at: null,
      },
    ], 'channel');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      storeKey: 'A',
      storeLabel: '凤八店',
      totals: { order_count: 5, net_income_cent: 5000 },
      breakdown: {
        shop: { order_count: 3, net_income_cent: 3200 },
        takeout: { order_count: 2, net_income_cent: 1800 },
      },
    });
  });

  it('keeps authoritative store totals when platform fallback rows are partial', () => {
    const rows = buildOrderStoreRowsFromLegacy([
      {
        dim_key: 'A|4', dim_label: '凤八店 · 美团外卖', source_type: 'takeout',
        order_count: 2, paid_amount: 20, income_amount: 19, refund_amount: 1,
        net_amount: 19, net_income: 18, avg_order_value: 9, refund_rate: 0.05,
        computed_at: null,
      },
    ], 'platform', [{
      dim_key: 'A', dim_label: '凤八店', source_type: undefined,
      order_count: 5, paid_amount: 60, income_amount: 55, refund_amount: 5,
      net_amount: 55, net_income: 50, avg_order_value: 10, refund_rate: 0.0833,
      computed_at: null,
    }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      totals: { order_count: 5, net_income_cent: 5000 },
      breakdown: { '4': { order_count: 2, net_income_cent: 1800 } },
    });
  });

  it('groups a store into periods and compares each period with its previous period', () => {
    const facts = [
      fact('2026-08-01', { A: { store_key: 'A', ...totals(2, 2200, 2000, 0) } }),
      fact('2026-08-02', { A: { store_key: 'A', ...totals(3, 3300, 3000, 0) } }),
      fact('2026-08-03', { A: { store_key: 'A', ...totals(4, 4400, 4000, 0) } }),
    ];

    const rows = buildStorePeriodRows(facts, 'A', 'day', '2026-08-02', '2026-08-03');

    expect(rows).toHaveLength(2);
    expect(rows[0].period).toBe('2026-08-02');
    expect(rows[0].comparison.net_income_cent).toMatchObject({
      current: 3000,
      previous: 2000,
      difference: 1000,
      change_rate: 0.5,
      status: 'ok',
    });
    expect(rows[1].comparison.order_count).toMatchObject({
      current: 4,
      previous: 3,
      difference: 1,
    });
  });

  it('marks zero or incomplete previous data as incomparable', () => {
    expect(compareOrderMetrics(
      { ...totals(1, 1000, 1000, 0), completed_days: 1, expected_days: 1 },
      { ...totals(0, 0, 0, 0), completed_days: 1, expected_days: 1 },
    ).net_income_cent.status).toBe('zero_previous');

    expect(compareOrderMetrics(
      { ...totals(1, 1000, 1000, 0), completed_days: 1, expected_days: 1 },
      { ...totals(1, 1000, 1000, 0), completed_days: 0, expected_days: 1 },
    ).net_income_cent.status).toBe('incomplete_previous');
  });
});
