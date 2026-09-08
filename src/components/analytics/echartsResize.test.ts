import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const chartFiles = ['DashboardPage', 'OrderCharts', 'ProductTrendChart', 'LaborTrendChart', 'RevenueAlertChart'];

describe('analytics ECharts resize handling', () => {
  it('observes chart container size changes, not only window resize', () => {
    for (const file of chartFiles) {
      const source = sources[`./${file}.tsx`];
      expect(source, file).toContain('ResizeObserver');
    }
  });
});
