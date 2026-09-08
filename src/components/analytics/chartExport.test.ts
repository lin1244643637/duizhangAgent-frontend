import { describe, expect, it } from 'vitest';
import { chartFilename, chartRowsFromOption } from './chartExport';

describe('chart export', () => {
  it('keeps every series in XLSX rows even when a legend item is hidden', () => {
    const option = {
      legend: { selected: { 门店B: false } },
      xAxis: { type: 'category', data: ['07-01', '07-02'] },
      series: [
        { name: '门店A', data: [100, 120] },
        { name: '门店B', data: [200, 220] },
      ],
    };

    expect(chartRowsFromOption(option)).toEqual([
      ['周期', '门店A', '门店B'],
      ['07-01', 100, 200],
      ['07-02', 120, 220],
    ]);
  });

  it('uses category rows for pie charts and a range-aware filename', () => {
    expect(chartRowsFromOption({
      series: [{
        name: '净实收',
        type: 'pie',
        data: [{ name: '堂食', value: 100 }, { name: '外卖', value: 200 }],
      }],
    })).toEqual([
      ['分类', '净实收'],
      ['堂食', 100],
      ['外卖', 200],
    ]);
    expect(chartFilename('门店净实收趋势', '2026-07-01', '2026-07-31', 'xlsx'))
      .toBe('门店净实收趋势_2026-07-01_2026-07-31.xlsx');
  });
});
