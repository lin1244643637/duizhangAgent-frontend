import { describe, expect, it } from 'vitest';
import type { LaborTrendPoint } from '../../api/analytics';
import {
  LABOR_COMPLETENESS_STATUS,
  laborCompletenessStatus,
  MIN_LEGACY_LABOR_COMPLETENESS_RATIO,
  visibleLaborTrendPoints,
} from './laborCompleteness';

function point(overrides: Partial<LaborTrendPoint> = {}): LaborTrendPoint {
  return {
    actual_hours: 10,
    actual_revenue_per_hour: 100,
    headcount: 1,
    missing: false,
    net_revenue: 1000,
    period: '2026-07-20',
    planned_hours: 20,
    planned_revenue_per_hour: 50,
    ...overrides,
  };
}

describe('laborCompleteness', () => {
  it('filters missing and severely incomplete labor dates', () => {
    expect(laborCompletenessStatus(point({ missing: true }))).toBe(LABOR_COMPLETENESS_STATUS.missing);
    expect(laborCompletenessStatus(point({ actual_hours: 0, planned_hours: 100 }))).toBe(LABOR_COMPLETENESS_STATUS.filtered);
    expect(visibleLaborTrendPoints([
      point({ period: '2026-07-28' }),
      point({ actual_hours: 0, period: '2026-07-29', planned_hours: 100 }),
    ]).map(item => item.period)).toEqual(['2026-07-28']);
  });

  it('keeps the legacy threshold and valid zero dates', () => {
    expect(MIN_LEGACY_LABOR_COMPLETENESS_RATIO).toBe(0.2);
    expect(laborCompletenessStatus(point({ actual_hours: 2, planned_hours: 10 }))).toBe(LABOR_COMPLETENESS_STATUS.visible);
    expect(laborCompletenessStatus(point({ actual_hours: 1.99, planned_hours: 10 }))).toBe(LABOR_COMPLETENESS_STATUS.filtered);
    expect(laborCompletenessStatus(point({ actual_hours: 0, planned_hours: 0, net_revenue: 0 }))).toBe(LABOR_COMPLETENESS_STATUS.visible);
  });

  it('uses sync status only when planned hours cannot determine completeness', () => {
    expect(laborCompletenessStatus(point({ actual_hours: 10, hours_synced: false, planned_hours: 10 }))).toBe(LABOR_COMPLETENESS_STATUS.visible);
    expect(laborCompletenessStatus(point({ actual_hours: 0, hours_synced: true, planned_hours: 0 }))).toBe(LABOR_COMPLETENESS_STATUS.visible);
    expect(laborCompletenessStatus(point({ actual_hours: 0, hours_synced: false, planned_hours: 0 }))).toBe(LABOR_COMPLETENESS_STATUS.filtered);
  });
});
