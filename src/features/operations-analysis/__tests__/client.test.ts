import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOperationsOverview,
  fetchOperationsPeriodSales,
  fetchOperationsProducts,
} from '../api/client';
import type { OperationsFilters } from '../types/contracts';

const filters: OperationsFilters = {
  scopeKeys: ['department:100', 'shop:851784429'],
  storeKeys: ['851784429', '911041685'],
  channel: 'takeout',
  granularity: 'week',
  dateFrom: '2026-07-01',
  dateTo: '2026-07-28',
  compare: 'previous',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('运营分析请求客户端', () => {
  it('经营概览请求携带周期粒度', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ metrics: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));
    vi.stubGlobal('fetch', fetchMock);

    await fetchOperationsOverview({ filters });

    const url = new URL(String(fetchMock.mock.calls[0][0]), 'https://example.test');
    expect(url.pathname).toBe('/api/v1/analytics/operations/overview');
    expect(url.searchParams.get('granularity')).toBe('week');
    expect(url.searchParams.get('include_current')).toBe('false');
    await fetchOperationsOverview({ filters, refresh: true });

    const refreshUrl = new URL(String(fetchMock.mock.calls[1][0]), 'https://example.test');
    expect(refreshUrl.searchParams.get('refresh')).toBe('true');
  });

  it('按重复参数发送门店范围与公共筛选', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ points: [], summary: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchOperationsPeriodSales({ filters });

    const url = new URL(String(fetchMock.mock.calls[0][0]), 'https://example.test');
    expect(url.pathname).toBe('/api/v1/analytics/operations/period-sales');
    expect(url.searchParams.getAll('scope_keys')).toEqual(['department:100', 'shop:851784429']);
    expect(url.searchParams.getAll('store_keys')).toEqual(['851784429', '911041685']);
    expect(url.searchParams.get('granularity')).toBe('week');
    expect(url.searchParams.get('include_current')).toBe('false');
    expect(url.searchParams.get('compare')).toBe('previous');
    expect(url.searchParams.getAll('order_channels')).toEqual(['takeout']);
  });


  it('显式发送包含当前周期、渠道数组和平台编码', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ metrics: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchOperationsOverview({
      filters: {
        ...filters,
        channel: 'all',
        includeCurrent: true,
        orderChannels: ['shop', 'takeout'],
        platformCodes: [0, '6'],
        orderBreakdown: 'platform',
      },
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]), 'https://example.test');
    expect(url.searchParams.get('include_current')).toBe('true');
    expect(url.searchParams.getAll('order_channels')).toEqual(['shop', 'takeout']);
    expect(url.searchParams.getAll('platform_codes')).toEqual(['0', '6']);
    expect(url.searchParams.get('order_breakdown')).toBe('platform');
  });

  it('产品请求携带渠道、平台、商品与分页参数', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchOperationsProducts({
      filters,
      platformIds: [1, 6],
      productKeys: ['dish:100', 'dish:200'],
      limit: 20,
      offset: 40,
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]), 'https://example.test');
    expect(url.searchParams.getAll('platform_ids')).toEqual(['1', '6']);
    expect(url.searchParams.getAll('product_keys')).toEqual(['dish:100', 'dish:200']);
    expect(url.searchParams.getAll('order_channels')).toEqual(['takeout']);
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('offset')).toBe('40');
  });
});
