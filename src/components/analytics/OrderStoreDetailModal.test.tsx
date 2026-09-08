import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrderDailyFact } from '../../api/analyticsDailyTypes';

const dailyFactsApi = vi.hoisted(() => ({ getOrderDailyFacts: vi.fn() }));

vi.mock('../../api/analyticsDailyFacts', () => dailyFactsApi);
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('./OrderStoreTrendChart', () => ({
  OrderStoreTrendChart: ({ series }: { series: Array<{ label: string; points: Array<{ net_income_cent: number }> }> }) => (
    <div
      data-testid="order-store-trend-chart"
      data-points={series[0]?.points.length || 0}
      data-series={series.map(item => item.label).join('|')}
      data-latest-values={series.map(item => item.points[item.points.length - 1]?.net_income_cent || 0).join('|')}
    />
  ),
}));

import { OrderStoreDetailModal } from './OrderStoreDetailModal';

function dailyFact(date: string, amount: number): OrderDailyFact {
  return {
    date,
    complete: true,
    order_count: 1,
    paid_amount_cent: amount,
    income_amount_cent: amount,
    refund_amount_cent: 0,
    net_amount_cent: amount,
    net_income_cent: amount,
    stores: {
      A: {
        store_key: 'A',
        store_label: '凤八店',
        order_count: 1,
        paid_amount_cent: amount,
        income_amount_cent: amount,
        refund_amount_cent: 0,
        net_amount_cent: amount,
        net_income_cent: amount,
        source_totals: {
          shop: {
            order_count: 1,
            paid_amount_cent: Math.round(amount * 0.6),
            income_amount_cent: Math.round(amount * 0.6),
            refund_amount_cent: 0,
            net_amount_cent: Math.round(amount * 0.6),
            net_income_cent: Math.round(amount * 0.6),
          },
          takeout: {
            order_count: 1,
            paid_amount_cent: Math.round(amount * 0.4),
            income_amount_cent: Math.round(amount * 0.4),
            refund_amount_cent: 0,
            net_amount_cent: Math.round(amount * 0.4),
            net_income_cent: Math.round(amount * 0.4),
          },
        },
      },
    },
  };
}

function facts(dateFrom: string, count: number): OrderDailyFact[] {
  const start = new Date(`${dateFrom}T00:00:00+08:00`);
  return Array.from({ length: count }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(current);
    return dailyFact(date, (index + 1) * 1000);
  });
}

function factsWithHistory(): OrderDailyFact[] {
  return [...facts('2026-02-04', 169), ...facts('2026-07-23', 20)];
}

beforeEach(() => {
  vi.clearAllMocks();
  dailyFactsApi.getOrderDailyFacts.mockResolvedValue([]);
});

afterEach(cleanup);

describe('OrderStoreDetailModal', () => {
  it('reuses parent daily facts and keeps view/comparison switches local', async () => {
    render(
      <OrderStoreDetailModal
        open
        store={{ storeKey: 'A', storeLabel: '凤八店' }}
        initialGranularity="day"
        secondaryDimension="none"
        seedFacts={factsWithHistory()}
        todayYmd="2026-08-12"
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('凤八店订单趋势')).toBeTruthy();
    expect(screen.getByTestId('order-store-trend-chart')).toBeTruthy();
    expect(screen.getByText('区间净实收').parentElement?.textContent).toContain('+181.8%');
    expect(dailyFactsApi.getOrderDailyFacts).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('详细数据'));
    expect(await screen.findByText('逐周期明细')).toBeTruthy();
    expect(screen.getByTitle('下载表格')).toBeTruthy();
    expect(screen.getByLabelText('单店对比方式')).toBeTruthy();
    expect(screen.getByLabelText('单店对比展示')).toBeTruthy();

    fireEvent.mouseDown(screen.getByLabelText('单店对比展示'));
    fireEvent.click(screen.getByText('差值'));
    await act(async () => { await Promise.resolve(); });
    expect(dailyFactsApi.getOrderDailyFacts).not.toHaveBeenCalled();
  });

  it('loads only through the existing daily-fact delta API when the session range is incomplete', async () => {
    dailyFactsApi.getOrderDailyFacts.mockResolvedValueOnce(
      facts('2026-02-04', 189).map(payload => ({
        date: payload.date,
        payload,
      })),
    );

    render(
      <OrderStoreDetailModal
        open
        store={{ storeKey: 'A', storeLabel: '凤八店' }}
        initialGranularity="day"
        secondaryDimension="none"
        seedFacts={[dailyFact('2026-08-11', 1000)]}
        todayYmd="2026-08-12"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(dailyFactsApi.getOrderDailyFacts).toHaveBeenCalledWith(
      '2026-02-04',
      '2026-08-11',
      {},
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect((await screen.findByTestId('order-store-trend-chart')).getAttribute('data-points')).toBe('10');
  });

  it('preserves the channel dimension in both the trend chart and detail table', async () => {
    render(
      <OrderStoreDetailModal
        open
        store={{ storeKey: 'A', storeLabel: '凤八店' }}
        initialGranularity="day"
        secondaryDimension="channel"
        seedFacts={factsWithHistory()}
        todayYmd="2026-08-12"
        onClose={vi.fn()}
      />,
    );

    const chart = await screen.findByTestId('order-store-trend-chart');
    expect(chart.getAttribute('data-series')).toBe('堂食|外卖');
    expect(chart.getAttribute('data-latest-values')).toBe('12000|8000');
    fireEvent.click(screen.getByText('详细数据'));
    expect((await screen.findAllByText('堂食')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('外卖')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('¥120.00')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('¥80.00')).length).toBeGreaterThan(0);
    expect(document.querySelector('.ant-table-bordered')).toBeTruthy();
  });
});
