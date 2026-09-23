import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as XLSX from 'xlsx-js-style';

import { TableDisplayFrame } from './TableDisplayFrame';

vi.mock('xlsx-js-style', () => ({
  utils: {
    aoa_to_sheet: vi.fn((rows: string[][]) => {
      const worksheet: Record<string, any> = { rows };
      rows.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
          worksheet[`${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`] = { v: value };
        });
      });
      worksheet['!ref'] = `A1:${String.fromCharCode(64 + Math.max(...rows.map(row => row.length)))}${rows.length}`;
      return worksheet;
    }),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

describe('TableDisplayFrame', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(window, 'getComputedStyle', {
      writable: true,
      value: vi.fn(() => ({
        getPropertyValue: vi.fn(() => ''),
        width: '0px',
        height: '0px',
        overflow: 'hidden',
        overflowX: 'hidden',
        overflowY: 'hidden',
      })),
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderFrame() {
    render(
      <TableDisplayFrame title="销售明细">
        <table>
          <thead>
            <tr>
              <th>门店</th>
              <th>净实收</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>茅坡店</td>
              <td>77851.45</td>
            </tr>
          </tbody>
        </table>
      </TableDisplayFrame>,
    );
  }

  it('downloads the wrapped table', async () => {
    renderFrame();

    fireEvent.click(screen.getByTitle('下载表格'));

    await waitFor(() => expect(XLSX.utils.aoa_to_sheet).toHaveBeenCalledWith([
        ['门店', '净实收'],
        ['茅坡店', '77851.45'],
      ]));
    expect(XLSX.writeFile).toHaveBeenCalledWith(expect.anything(), '销售明细.xlsx');
    const worksheet = vi.mocked(XLSX.utils.aoa_to_sheet).mock.results[0]?.value as Record<string, any>;
    expect(worksheet.A1.s.font.bold).toBe(true);
    expect(worksheet.A1.s.fill.fgColor.rgb).toBeTruthy();
    expect(worksheet.A2.s.border.bottom.style).toBe('thin');
    expect(worksheet['!cols']).toEqual(expect.arrayContaining([expect.objectContaining({ wch: expect.any(Number) })]));
  });

  it('opens and closes the fullscreen table modal', async () => {
    renderFrame();

    fireEvent.click(screen.getByTitle('全屏展示'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('茅坡店')).toBeTruthy();

    fireEvent.click(within(dialog).getByLabelText('关闭全屏表格'));

    await waitFor(() => {
      const hiddenDialog = screen.getByRole('dialog', { hidden: true });
      expect((hiddenDialog as HTMLElement).style.display).toBe('none');
    });
  });

  it('keeps the original cell presentation in fullscreen mode', () => {
    render(
      <TableDisplayFrame title="带样式明细">
        <table>
          <tbody>
            <tr><td><span className="font-medium text-amber-600">下降 8.2%</span></td></tr>
          </tbody>
        </table>
      </TableDisplayFrame>,
    );

    fireEvent.click(screen.getByTitle('全屏展示'));

    const styledValue = within(screen.getByRole('dialog')).getByText('下降 8.2%');
    expect(styledValue.className).toContain('text-amber-600');
    expect(styledValue.className).toContain('font-medium');
  });

  it('uses explicit structured rows in fullscreen and can hide incomplete downloads', () => {
    render(
      <TableDisplayFrame
        title="每日销售"
        exportTables={[{
          headers: ['日期'],
          rows: [['2026-08-01'], ['2026-08-02']],
        }]}
        showDownload={false}
      >
        <table><tbody><tr><td>2026-08-01</td></tr></tbody></table>
      </TableDisplayFrame>,
    );

    expect(screen.queryByTitle('下载表格')).toBeNull();
    fireEvent.click(screen.getByTitle('全屏展示'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('2026-08-01')).toBeTruthy();
    expect(within(dialog).getByText('2026-08-02')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: '下载' })).toBeNull();
  });

  it('splits comparison cells into styled xlsx columns without changing the rendered table', async () => {
    render(
      <TableDisplayFrame
        title="产品明细"
        exportTables={[{
          headers: ['产品', '销量'],
          rows: [
            ['肉夹馍', { value: 7166, comparison: { value: '+5.8%', tone: 'positive' } }],
            ['凉皮', { value: 5721, comparison: { value: '-4.8%', tone: 'negative' } }],
          ],
        }]}
      >
        <table><tbody><tr><td>页面样式保持不变</td></tr></tbody></table>
      </TableDisplayFrame>,
    );

    expect(screen.getByText('页面样式保持不变')).toBeTruthy();
    fireEvent.click(screen.getByTitle('下载表格'));

    await waitFor(() => expect(XLSX.utils.aoa_to_sheet).toHaveBeenCalledWith([
      ['产品', '销量', '销量较上期'],
      ['肉夹馍', '7166', '+5.8%'],
      ['凉皮', '5721', '-4.8%'],
    ]));
    const worksheet = vi.mocked(XLSX.utils.aoa_to_sheet).mock.results[0]?.value as Record<string, any>;
    expect(worksheet.C2.s.font.color.rgb).toBe('059669');
    expect(worksheet.C3.s.font.color.rgb).toBe('EF4444');
  });

  it('expands all comparison presentations into separate xlsx columns', async () => {
    render(
      <TableDisplayFrame
        title="订单明细"
        exportTables={[{
          headers: ['门店', '订单数'],
          rows: [[
            '凤八店',
            {
              value: 120,
              comparisons: [
                { label: '上期数据', value: 100, tone: 'positive' },
                { label: '较上期差值', value: '+20', tone: 'positive' },
                { label: '较上期比例', value: '+20.0%', tone: 'positive' },
              ],
            },
          ]],
        }]}
      >
        <table><tbody><tr><td>凤八店</td><td>120</td></tr></tbody></table>
      </TableDisplayFrame>,
    );

    fireEvent.click(screen.getByTitle('下载表格'));

    await waitFor(() => expect(XLSX.utils.aoa_to_sheet).toHaveBeenCalledWith([
      ['门店', '订单数', '订单数上期数据', '订单数较上期差值', '订单数较上期比例'],
      ['凤八店', '120', '100', '+20', '+20.0%'],
    ]));
  });
});
