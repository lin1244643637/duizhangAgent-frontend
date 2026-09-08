import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { draftSalaryTemplateFromExcel, listSalaryTemplates } from '../api/kb';
import { SalaryTemplatePanel } from './SalaryTemplatePanel';

vi.mock('../api/kb', () => ({
  deleteSalaryTemplate: vi.fn(),
  draftSalaryTemplateFromExcel: vi.fn(),
  listSalaryTemplates: vi.fn(),
  saveSalaryTemplate: vi.fn(),
}));

describe('SalaryTemplatePanel', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverMock });
    Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverMock });
  });

  beforeEach(() => {
    vi.mocked(listSalaryTemplates).mockReset();
    vi.mocked(draftSalaryTemplateFromExcel).mockReset();
    vi.mocked(listSalaryTemplates).mockResolvedValue([
      {
        id: 'tpl-1',
        name: '工资表模板',
        source_file: '工资表.xlsx',
        sheet_count: 1,
        input_count: 3,
        formula_count: 2,
        source: 'manual',
        updated_at: '2026-07-03T10:00:00+08:00',
      },
    ]);
    vi.mocked(draftSalaryTemplateFromExcel).mockResolvedValue({
      name: '工资表',
      template: { sheets: [] },
      summary: '识别出姓名、工时、应发工资',
      sheet_count: 1,
      input_count: 3,
      formula_count: 2,
    });
  });

  it('loads templates and generates a draft from the selected file', async () => {
    const { container } = render(<SalaryTemplatePanel isAdmin />);

    expect(await screen.findByText('工资表模板')).toBeTruthy();

    const file = new File(['excel'], '六月工资表.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByDisplayValue('六月工资表')).toBeTruthy();
    fireEvent.click(screen.getByText('解析生成模板'));

    await waitFor(() => {
      expect(draftSalaryTemplateFromExcel).toHaveBeenCalledWith(file, '六月工资表');
    });
    expect(await screen.findByText('识别出姓名、工时、应发工资')).toBeTruthy();
  });
});
