import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analyticsApi = vi.hoisted(() => ({
  getProducts: vi.fn(),
  getProductTrend: vi.fn(),
  listPlatformDim: vi.fn(),
  listStoreScopeTree: vi.fn(),
}));

const operationsApi = vi.hoisted(() => ({
  fetchOperationsProducts: vi.fn(),
}));

const dailyFactsApi = vi.hoisted(() => ({
  getProductDailyFacts: vi.fn(),
}));

vi.mock('../../api/analytics', () => analyticsApi);
vi.mock('../../features/operations-analysis/api/client', () => operationsApi);
vi.mock('../../api/analyticsDailyFacts', () => dailyFactsApi);
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

import { buildDetailPeriodOptions } from './trendPeriod';
import { buildProductTrendFromFacts, loadProductTrendRequests, ProductSection } from './ProductSection';

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  dailyFactsApi.getProductDailyFacts.mockRejectedValue(new Error('unsupported'));
  analyticsApi.getProducts.mockResolvedValue({
    top: [{
      product_key: 'p1',
      product_name: '产品A',
      quantity: 10,
      sales_amount: 200,
      order_count: 8,
      sales_share: 1,
    }],
    bottom: [],
    total: 1,
    snapshot_status: 'ready',
  });
  analyticsApi.getProductTrend.mockResolvedValue({
    product_key: 'p1',
    product_name: '产品A',
    points: [],
    moving_averages: [],
    store_trends: {},
  });
  analyticsApi.listPlatformDim.mockResolvedValue([]);
  analyticsApi.listStoreScopeTree.mockResolvedValue({ nodes: [], store_count: 0, source: 'test' });
  operationsApi.fetchOperationsProducts.mockResolvedValue(null);
});

describe('product trend request scheduling', () => {
  it('limits requests to four and reuses successful results for identical parameters', async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<(() => void) | undefined> = [];
    const loads = Array.from({ length: 5 }, (_, index) => vi.fn(
      () => new Promise<number>((resolve) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        releases[index] = () => {
          active -= 1;
          resolve(index);
        };
      }),
    ));
    const requests = loads.map((load, index) => ({ cacheKey: `product-${index}`, load }));
    const cache = new Map<string, Promise<number>>();

    const firstLoad = loadProductTrendRequests(
      requests,
      cache,
      new AbortController().signal,
    );

    await waitFor(() => expect(loads.slice(0, 4).every(load => load.mock.calls.length === 1)).toBe(true));
    expect(loads[4]).not.toHaveBeenCalled();
    expect(maxActive).toBe(4);

    releases[0]?.();
    await waitFor(() => expect(loads[4]).toHaveBeenCalledTimes(1));
    releases.slice(1).forEach(release => release?.());
    await expect(firstLoad).resolves.toEqual([0, 1, 2, 3, 4]);

    await expect(loadProductTrendRequests(
      requests,
      cache,
      new AbortController().signal,
    )).resolves.toEqual([0, 1, 2, 3, 4]);
    loads.forEach(load => expect(load).toHaveBeenCalledTimes(1));
  });

  it('stops dispatching queued requests after cancellation', async () => {
    const controller = new AbortController();
    const loads = Array.from({ length: 5 }, () => vi.fn(
      (signal: AbortSignal) => new Promise<number>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
    ));

    const loading = loadProductTrendRequests(
      loads.map((load, index) => ({ cacheKey: `cancel-${index}`, load })),
      new Map<string, Promise<number>>(),
      controller.signal,
    );
    await waitFor(() => expect(loads.slice(0, 4).every(load => load.mock.calls.length === 1)).toBe(true));

    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(loads[4]).not.toHaveBeenCalled();
  });
});

describe('ProductSection selected-period ranking', () => {
  it('calculates product moving averages from available complete days', () => {
    const facts = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-08-0${index + 1}`,
      snapshot_status: index === 3 ? 'partial' : 'ready',
      complete: index !== 3,
      top: [{
        product_key: 'p1',
        product_name: '产品A',
        quantity: index + 1,
        sales_amount: index + 1,
        order_count: index + 1,
        sales_share: 1,
      }],
    }));

    const trend = buildProductTrendFromFacts(
      { product_key: 'p1', product_name: '产品A' },
      facts,
      'day',
      true,
      '2026-08-01',
      '2026-08-07',
    );

    expect(trend.points[3].missing).toBe(true);
    expect(trend.points[6].ma7).toBe(4);
  });

  it('keeps hidden incomplete product days out of the available-day average', () => {
    const facts = Array.from({ length: 8 }, (_, index) => ({
      date: `2026-08-0${index + 1}`,
      snapshot_status: index === 3 ? 'partial' : 'ready',
      complete: index !== 3,
      top: index === 3 ? [] : [{
        product_key: 'p1',
        product_name: '产品A',
        quantity: index + 1,
        sales_amount: index + 1,
        order_count: index + 1,
        sales_share: 1,
      }],
    }));

    const trend = buildProductTrendFromFacts(
      { product_key: 'p1', product_name: '产品A' },
      facts,
      'day',
      false,
      '2026-08-01',
      '2026-08-08',
    );

    expect(trend.points.map(point => point.period)).not.toContain('2026-08-04');
    expect(trend.points[trend.points.length - 1]?.ma7).toBe(5);
  });

  it('does not expose the duplicate source type dimension', async () => {
    render(<ProductSection show={vi.fn()} />);

    await waitFor(() => expect(analyticsApi.getProducts).toHaveBeenCalled());
    fireEvent.mouseDown(screen.getByLabelText('产品维度'));

    expect(await screen.findByText('堂食/外卖')).toBeTruthy();
    expect(screen.queryByText('食亨来源')).toBeNull();
  });

  it('switches ranking periods without reloading the multi-period product trend', async () => {
    render(<ProductSection show={vi.fn()} />);

    await waitFor(() => expect(analyticsApi.getProductTrend).toHaveBeenCalled());
    const trendCallCount = analyticsApi.getProductTrend.mock.calls.length;
    const trendCall = analyticsApi.getProductTrend.mock.calls[analyticsApi.getProductTrend.mock.calls.length - 1]!;
    const periods = buildDetailPeriodOptions('week', trendCall[1], trendCall[2]);
    const latest = periods[periods.length - 1]!;
    const previous = periods[periods.length - 2]!;

    await waitFor(() => expect(analyticsApi.getProducts).toHaveBeenLastCalledWith(
      'day',
      latest.dateTo,
      'ALL',
      false,
      0,
      'all',
      false,
      expect.objectContaining({ dateFrom: latest.dateFrom, dateTo: latest.dateTo }),
    ));
    expect(screen.getByLabelText('产品数据周期')).toBeTruthy();
    const periodControls = screen.getByTestId('product-table-period-controls');
    expect(within(periodControls).getByLabelText('产品对比展示')).toBeTruthy();

    analyticsApi.getProducts.mockResolvedValueOnce({
      top: [],
      bottom: [],
      total: 0,
      snapshot_status: 'ready',
    });
    fireEvent.mouseDown(screen.getByLabelText('产品数据周期'));
    const options = await screen.findAllByText(previous.label);
    fireEvent.click(options[options.length - 1]);

    await waitFor(() => expect(analyticsApi.getProducts).toHaveBeenLastCalledWith(
      'day',
      previous.dateTo,
      'ALL',
      false,
      0,
      'all',
      false,
      expect.objectContaining({ dateFrom: previous.dateFrom, dateTo: previous.dateTo }),
    ));
    expect(analyticsApi.getProductTrend).toHaveBeenCalledTimes(trendCallCount);
    expect(screen.getByTestId('product-table-period-controls').textContent).toContain('切换周期');
    expect(screen.getByText('已选 1 / 5 个产品')).toBeTruthy();
    expect(screen.getByText('单品销量趋势')).toBeTruthy();
  });

  it('reuses product daily facts when ranking period changes', async () => {
    dailyFactsApi.getProductDailyFacts.mockImplementation((dateFrom: string, dateTo: string) => {
      const periods = buildDetailPeriodOptions('week', dateFrom, dateTo);
      const latest = periods[periods.length - 1]!;
      const previous = periods[periods.length - 2]!;
      return Promise.resolve([
        {
          date: previous.dateFrom,
          payload: {
            top: [{
              product_key: 'p-old',
              product_name: '上周产品',
              quantity: 3,
              sales_amount: 30,
              order_count: 2,
              sales_share: 1,
            }],
            bottom: [],
            total: 1,
            snapshot_status: 'ready',
          },
        },
        {
          date: latest.dateFrom,
          payload: {
            top: [{
              product_key: 'p-new',
              product_name: '本周产品',
              quantity: 9,
              sales_amount: 90,
              order_count: 6,
              sales_share: 1,
            }],
            bottom: [],
            total: 1,
            snapshot_status: 'ready',
          },
        },
      ]);
    });

    render(<ProductSection show={vi.fn()} />);

    await waitFor(() => expect(dailyFactsApi.getProductDailyFacts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('本周产品')).toBeTruthy());
    expect(analyticsApi.getProducts).not.toHaveBeenCalled();

    const [dateFrom, dateTo] = dailyFactsApi.getProductDailyFacts.mock.calls[0] as [string, string];
    const periods = buildDetailPeriodOptions('week', dateFrom, dateTo);
    const previous = periods[periods.length - 2]!;
    fireEvent.mouseDown(screen.getByLabelText('产品数据周期'));
    const options = await screen.findAllByText(previous.label);
    fireEvent.click(options[options.length - 1]);

    await waitFor(() => expect(screen.getByText('上周产品')).toBeTruthy());
    expect(dailyFactsApi.getProductDailyFacts).toHaveBeenCalledTimes(1);
    expect(analyticsApi.getProducts).not.toHaveBeenCalled();
  });

  it('uses the server aggregate trend for monthly MA12 instead of full product daily facts', async () => {
    dailyFactsApi.getProductDailyFacts.mockImplementation((_dateFrom: string, dateTo: string) => Promise.resolve([
      {
        date: dateTo,
        payload: {
        top: [{
          product_key: 'p1',
          product_name: '产品A',
          quantity: 10,
          sales_amount: 200,
          order_count: 8,
          sales_share: 1,
        }],
        bottom: [],
        total: 1,
        snapshot_status: 'ready',
      },
      },
    ]));
    render(<ProductSection show={vi.fn()} />);

    await waitFor(() => expect(analyticsApi.getProductTrend).toHaveBeenCalled());
    const initialFactCallCount = dailyFactsApi.getProductDailyFacts.mock.calls.length;
    analyticsApi.getProductTrend.mockClear();
    fireEvent.click(screen.getByLabelText('月'));

    await waitFor(() => expect(analyticsApi.getProductTrend).toHaveBeenLastCalledWith(
      'p1',
      expect.any(String),
      expect.any(String),
      'ALL',
      'all',
      expect.objectContaining({ granularity: 'month' }),
    ));
    await waitFor(() => expect(dailyFactsApi.getProductDailyFacts).toHaveBeenCalledTimes(initialFactCallCount + 1));
    const monthlyTrendCall = analyticsApi.getProductTrend.mock.calls[analyticsApi.getProductTrend.mock.calls.length - 1]!;
    const monthlyFactCall = dailyFactsApi.getProductDailyFacts.mock.calls[dailyFactsApi.getProductDailyFacts.mock.calls.length - 1]!;
    expect(monthlyFactCall[0]).toBe(monthlyTrendCall[1]);
  });
});
