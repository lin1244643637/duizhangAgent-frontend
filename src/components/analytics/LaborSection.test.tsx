import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analyticsApi = vi.hoisted(() => ({
  getLaborEfficiency: vi.fn(),
  getLaborEfficiencyDetail: vi.fn(),
  getLaborEfficiencyTrend: vi.fn(),
  listStoreScopeTree: vi.fn(),
}));

const operationsApi = vi.hoisted(() => ({
  fetchOperationsLabor: vi.fn(),
}));

const dailyFactsApi = vi.hoisted(() => ({
  getLaborDailyFacts: vi.fn(),
}));

vi.mock('../../api/analytics', () => analyticsApi);
vi.mock('../../features/operations-analysis/api/client', () => operationsApi);
vi.mock('../../api/analyticsDailyFacts', () => dailyFactsApi);
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

import { buildDetailPeriodOptions } from './trendPeriod';
import { laborTrendFromFacts, type LaborDailyFact, LaborSection } from './LaborSection';

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  dailyFactsApi.getLaborDailyFacts.mockRejectedValue(new Error('unsupported'));
  analyticsApi.getLaborEfficiency.mockResolvedValue({
    rows: [{
      store_key: '801',
      store_label: '门店A',
      net_revenue: 7000,
      planned_hours: 70,
      actual_hours: 60,
      revenue_per_hour: 116.67,
      headcount: 8,
      hours_gap: 10,
      uncovered: false,
    }],
    refresh_queued: false,
  });
  analyticsApi.getLaborEfficiencyTrend.mockResolvedValue({
    points: [],
    moving_averages: [],
    store_trends: {},
  });
  analyticsApi.getLaborEfficiencyDetail.mockResolvedValue(null);
  analyticsApi.listStoreScopeTree.mockResolvedValue({ nodes: [], store_count: 0, source: 'test' });
  operationsApi.fetchOperationsLabor.mockResolvedValue(null);
});

describe('LaborSection selected-period details', () => {
  it('marks incomplete labor periods missing and averages the available complete days', () => {
    const facts: LaborDailyFact[] = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-08-0${index + 1}`,
      data_status: index === 3 ? 'incomplete' : 'ready',
      complete: index !== 3,
      stores: index === 3 ? undefined : {
        '801': {
          store_key: '801',
          store_label: '门店A',
          net_revenue_cent: 10000,
          planned_hours: 10,
          actual_hours: 8,
          headcount: 2,
          data_status: 'ready',
        },
      },
    }));

    const trend = laborTrendFromFacts(
      facts,
      'day',
      true,
      ['801'],
      false,
      '2026-08-01',
      '2026-08-07',
    );

    expect(trend.points[3].missing).toBe(true);
    expect(trend.points[6].actual_hours_ma7).toBe(8);
  });

  it('keeps hidden incomplete labor days out of the available-day average', () => {
    const facts: LaborDailyFact[] = Array.from({ length: 8 }, (_, index) => ({
      date: `2026-08-0${index + 1}`,
      data_status: index === 3 ? 'incomplete' : 'ready',
      complete: index !== 3,
      stores: index === 3 ? undefined : {
        '801': {
          store_key: '801',
          store_label: '门店A',
          net_revenue_cent: 10000,
          planned_hours: 10,
          actual_hours: 8,
          headcount: 2,
          data_status: 'ready',
        },
      },
    }));

    const trend = laborTrendFromFacts(
      facts,
      'day',
      false,
      ['801'],
      false,
      '2026-08-01',
      '2026-08-08',
    );

    expect(trend.points.map(point => point.period)).not.toContain('2026-08-04');
    expect(trend.points[trend.points.length - 1]?.actual_hours_ma7).toBe(8);
  });

  it('prefers the backend labor summary totals', async () => {
    analyticsApi.getLaborEfficiency.mockResolvedValue({
      rows: [
        { store_key: '801', store_label: '门店A', net_revenue: 0.1, planned_hours: 1, actual_hours: 1, revenue_per_hour: 0.1, headcount: 1, hours_gap: 0, uncovered: false },
        { store_key: '802', store_label: '门店B', net_revenue: 0.2, planned_hours: 2, actual_hours: 2, revenue_per_hour: 0.1, headcount: 1, hours_gap: 0, uncovered: false },
      ],
      refresh_queued: false,
    });
    operationsApi.fetchOperationsLabor.mockResolvedValue({
      previous_period: { date_from: '2026-06-01', date_to: '2026-06-07' },
      summary: {
        net_revenue: 12.34,
        planned_hours: 3,
        actual_hours: 3,
        actual_revenue_per_hour: 4.11,
        planned_revenue_per_hour: 4.11,
        comparison: {},
      },
    });

    render(<LaborSection show={vi.fn()} />);

    expect(await screen.findByText('¥12.34')).toBeTruthy();
  });

  it('switches summary and table periods without reloading the multi-period trend', async () => {
    render(<LaborSection show={vi.fn()} />);

    await waitFor(() => expect(analyticsApi.getLaborEfficiencyTrend).toHaveBeenCalled());
    const trendCallCount = analyticsApi.getLaborEfficiencyTrend.mock.calls.length;
    const [trendDateFrom, trendDateTo] = analyticsApi.getLaborEfficiencyTrend.mock.calls[analyticsApi.getLaborEfficiencyTrend.mock.calls.length - 1]!;
    const periods = buildDetailPeriodOptions('week', trendDateFrom, trendDateTo);
    const latest = periods[periods.length - 1]!;
    const previous = periods[periods.length - 2]!;

    await waitFor(() => expect(analyticsApi.getLaborEfficiency).toHaveBeenLastCalledWith(
      latest.dateFrom,
      latest.dateTo,
      false,
      expect.any(Object),
    ));
    expect(screen.getByLabelText('人效数据周期')).toBeTruthy();
    const periodSummary = screen.getByTestId('labor-period-summary');
    expect(periodSummary.className).toContain('bg-slate-50');
    expect(within(periodSummary).getByLabelText('人效对比展示')).toBeTruthy();

    fireEvent.mouseDown(screen.getByLabelText('人效数据周期'));
    const options = await screen.findAllByText(previous.label);
    fireEvent.click(options[options.length - 1]);

    await waitFor(() => expect(analyticsApi.getLaborEfficiency).toHaveBeenLastCalledWith(
      previous.dateFrom,
      previous.dateTo,
      false,
      expect.any(Object),
    ));
    expect(analyticsApi.getLaborEfficiencyTrend).toHaveBeenCalledTimes(trendCallCount);
    expect(screen.getByTestId('labor-period-summary').textContent).toContain(previous.label);

    fireEvent.click(screen.getByRole('button', { name: '工时' }));
    await waitFor(() => expect(analyticsApi.getLaborEfficiencyDetail).toHaveBeenCalledWith(
      previous.dateFrom,
      previous.dateTo,
      '801',
    ));
  });

  it('changes labor detail period without refetching daily facts', async () => {
    dailyFactsApi.getLaborDailyFacts.mockImplementationOnce((dateFrom: string, dateTo: string) => {
      const periods = buildDetailPeriodOptions('week', dateFrom, dateTo);
      const latest = periods[periods.length - 1];
      const previous = periods[periods.length - 2];
      const incompleteDate = periods[0]?.dateTo;
      const rows = [];
      const start = new Date(`${dateFrom}T00:00:00Z`);
      const end = new Date(`${dateTo}T00:00:00Z`);
      for (let current = start; current <= end; current = new Date(current.getTime() + 86400000)) {
        const date = current.toISOString().slice(0, 10);
        const incomplete = date === incompleteDate;
        const values = date === previous?.dateTo
          ? { net_revenue_cent: 400000, planned_hours: 50, actual_hours: 40, headcount: 6 }
          : date === latest?.dateTo
            ? { net_revenue_cent: 900000, planned_hours: 90, actual_hours: 80, headcount: 8 }
            : incomplete
              ? { net_revenue_cent: 1000000, planned_hours: 90, actual_hours: 1, headcount: 8 }
              : { net_revenue_cent: 0, planned_hours: 0, actual_hours: 0, headcount: 8 };
        rows.push({
          date,
          payload: {
            date,
            data_status: incomplete ? 'incomplete' : 'ready',
            stores: {
              '801': {
                store_key: '801',
                store_label: '门店A',
                ...values,
                data_status: incomplete ? 'incomplete' : 'ready',
              },
            },
          },
        });
      }
      return Promise.resolve(rows);
    });

    render(<LaborSection show={vi.fn()} />);

    await waitFor(() => expect(dailyFactsApi.getLaborDailyFacts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText('90.0').length).toBeGreaterThan(0));
    expect(screen.queryByText('1.0')).toBeNull();
    expect(analyticsApi.getLaborEfficiencyTrend).not.toHaveBeenCalled();
    await waitFor(() => expect(analyticsApi.getLaborEfficiency).toHaveBeenCalled());
    const row = screen.getByText('门店A').closest('tr');
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText('8')).toBeTruthy();
    expect(within(row as HTMLElement).queryByText('14')).toBeNull();

    const [dateFrom, dateTo] = dailyFactsApi.getLaborDailyFacts.mock.calls[0] as [string, string];
    const periods = buildDetailPeriodOptions('week', dateFrom, dateTo);
    const previous = periods[periods.length - 2];
    fireEvent.mouseDown(screen.getByLabelText('人效数据周期'));
    const options = await screen.findAllByText(previous.label);
    fireEvent.click(options[options.length - 1]);

    await waitFor(() => expect(screen.getAllByText('40.0').length).toBeGreaterThan(0));
    expect(dailyFactsApi.getLaborDailyFacts).toHaveBeenCalledTimes(1);
    expect(analyticsApi.getLaborEfficiencyTrend).not.toHaveBeenCalled();
    expect(analyticsApi.getLaborEfficiency).toHaveBeenCalled();
  });
});
