import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PeriodComparisonRate, PeriodComparisonText } from './PeriodComparison';

describe('PeriodComparisonText', () => {
  it('shows both the signed difference and change rate for comparable periods', () => {
    const { container } = render(<PeriodComparisonText comparison={{
      current: 1000,
      previous: 800,
      difference: 200,
      change_rate: 0.25,
      status: 'ok',
    }} />);

    expect(screen.getByText('较上期 +¥200.00 · +25.0%')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('text-emerald-600');
  });

  it('shows a calculable rate while preserving the incomplete status', () => {
    const { container } = render(<PeriodComparisonText comparison={{
      current: 1000,
      previous: 800,
      difference: 200,
      change_rate: 0.25,
      status: 'incomplete_current',
    }} />);

    expect(screen.getByText('较上期 +¥200.00 · +25.0%')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('text-emerald-600');
  });

  it('shows decreases in red', () => {
    const { container } = render(<PeriodComparisonText comparison={{
      current: 800,
      previous: 1000,
      difference: -200,
      change_rate: -0.2,
      status: 'ok',
    }} />);

    expect(screen.getByText('较上期 -¥200.00 · -20.0%')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('text-red-500');
  });

  it('shows a zero change in gray', () => {
    const { container } = render(<PeriodComparisonText comparison={{
      current: 1000,
      previous: 1000,
      difference: 0,
      change_rate: 0,
      status: 'ok',
    }} />);

    expect(screen.getByText('较上期 ¥0.00 · 0.0%')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('text-slate-500');
  });

  it('explains that a zero previous value cannot produce a ratio', () => {
    const { container } = render(<PeriodComparisonText comparison={{
      current: 1000,
      previous: 0,
      difference: 1000,
      change_rate: null,
      status: 'zero_previous',
    }} />);

    expect(screen.getByText('上期数据不全，比例不可比')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('text-slate-400');
  });

  it('shows not comparable when either period has no value', () => {
    render(<PeriodComparisonText comparison={{
      current: 1000,
      previous: null,
      difference: null,
      change_rate: null,
      status: 'missing_previous',
    }} />);

    expect(screen.getByText('较上期 不可比')).toBeTruthy();
  });

  it('switches between percentage, difference, previous and all presentations', () => {
    const comparison = {
      current: 1000,
      previous: 800,
      difference: 200,
      change_rate: 0.25,
      status: 'ok',
    };
    const { rerender } = render(<PeriodComparisonText comparison={comparison} displayMode="percentage" />);
    expect(screen.getByText('较上期 +25.0%')).toBeTruthy();

    rerender(<PeriodComparisonText comparison={comparison} displayMode="difference" />);
    expect(screen.getByText('较上期 +¥200.00')).toBeTruthy();

    rerender(<PeriodComparisonText comparison={comparison} displayMode="previous" />);
    expect(screen.getByText('上期 ¥800.00')).toBeTruthy();

    rerender(<PeriodComparisonText comparison={comparison} displayMode="all" />);
    expect(screen.getByText('上期 ¥800.00 · 差值 +¥200.00 · 比例 +25.0%')).toBeTruthy();
  });

  it('keeps difference and previous values available when the percentage is not comparable', () => {
    const comparison = {
      current: 1000,
      previous: 0,
      difference: 1000,
      change_rate: null,
      status: 'zero_previous',
    };
    const { rerender } = render(<PeriodComparisonText comparison={comparison} displayMode="percentage" />);
    expect(screen.getByText('上期数据不全，比例不可比')).toBeTruthy();

    rerender(<PeriodComparisonText comparison={comparison} displayMode="difference" />);
    expect(screen.getByText('较上期 +¥1,000.00')).toBeTruthy();

    rerender(<PeriodComparisonText comparison={comparison} displayMode="previous" />);
    expect(screen.getByText('上期 ¥0.00')).toBeTruthy();
  });
});

describe('PeriodComparisonRate', () => {
  it('uses the same explanation when the previous value is zero', () => {
    const { container } = render(<PeriodComparisonRate comparison={{
      current: 1000,
      previous: 0,
      difference: 1000,
      change_rate: null,
      status: 'zero_previous',
    }} />);

    expect(screen.getByText('上期数据不全，比例不可比')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('text-slate-400');
  });

  it('supports compact difference and previous value displays', () => {
    const comparison = {
      current: 12,
      previous: 10,
      difference: 2,
      change_rate: 0.2,
      status: 'ok',
    };
    const { rerender } = render(
      <PeriodComparisonRate comparison={comparison} displayMode="difference" format="integer" />,
    );
    expect(screen.getByText('+2')).toBeTruthy();

    rerender(<PeriodComparisonRate comparison={comparison} displayMode="previous" format="integer" />);
    expect(screen.getByText('上期 10')).toBeTruthy();
  });
});
