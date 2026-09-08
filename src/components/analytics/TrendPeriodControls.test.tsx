import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrendPeriodControls } from './TrendPeriodControls';

afterEach(cleanup);

describe('TrendPeriodControls', () => {
  it('keeps the desktop range selection pending until the user confirms it', () => {
    render(
      <TrendPeriodControls
        granularity="day"
        dateFrom="2026-07-10"
        dateTo="2026-07-19"
        includeCurrent={false}
        onGranularityChange={vi.fn()}
        onRangeChange={vi.fn()}
        onIncludeCurrentChange={vi.fn()}
        todayYmd="2026-07-20"
      />,
    );

    fireEvent.click(screen.getAllByRole('textbox')[0]);

    expect(screen.getByRole('button', { name: /确\s*定/ })).toBeTruthy();
  });

  it('keeps the displayed range synchronized with committed query props', () => {
    const props = {
      granularity: 'day' as const,
      dateFrom: '2026-07-10',
      dateTo: '2026-07-19',
      includeCurrent: false,
      onGranularityChange: vi.fn(),
      onRangeChange: vi.fn(),
      onIncludeCurrentChange: vi.fn(),
      todayYmd: '2026-07-20',
    };
    const { rerender } = render(<TrendPeriodControls {...props} />);

    rerender(
      <TrendPeriodControls
        {...props}
        dateFrom="2026-06-01"
        dateTo="2026-06-30"
      />,
    );

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs[0].value).toBe('2026-06-01');
    expect(inputs[1].value).toBe('2026-06-30');
  });

  it('preserves an in-progress range while unrelated production data rerenders the page', () => {
    const onRangeChange = vi.fn();
    const props = {
      granularity: 'day' as const,
      dateFrom: '2026-07-10',
      dateTo: '2026-07-19',
      includeCurrent: false,
      onGranularityChange: vi.fn(),
      onRangeChange,
      onIncludeCurrentChange: vi.fn(),
      todayYmd: '2026-07-20',
    };
    const { rerender } = render(<TrendPeriodControls {...props} />);

    fireEvent.click(screen.getAllByRole('textbox')[0]);
    fireEvent.click(screen.getAllByTitle('2026-07-05')[0]);
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('2026-07-05');
    rerender(<TrendPeriodControls {...props} />);
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('2026-07-05');
    fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }));

    expect(onRangeChange).toHaveBeenCalledWith('2026-07-05', '2026-07-19');
  });
});
