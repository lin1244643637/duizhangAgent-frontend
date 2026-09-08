import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createKbEntry, extractFromSession } from '../api/kb';
import { KnowledgeExtractDialog } from './KnowledgeExtractDialog';

vi.mock('../api/kb', () => ({
  createKbEntry: vi.fn(),
  extractFromSession: vi.fn(),
}));

describe('KnowledgeExtractDialog', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    vi.mocked(extractFromSession).mockResolvedValue([
      { title: '门店规则', content: '午餐按 10-14 点统计', category: 'analytics' },
      { title: '产品规则', content: '员工餐不进产品分析', category: 'product' },
    ]);
    vi.mocked(createKbEntry).mockResolvedValue({} as Awaited<ReturnType<typeof createKbEntry>>);
  });

  it('loads extracted facts and writes selected facts', async () => {
    render(<KnowledgeExtractDialog sessionId="session-1" onClose={vi.fn()} />);

    expect(await screen.findByText('门店规则')).toBeTruthy();
    expect(screen.getByText('产品规则')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /产品规则/ }));
    expect(screen.getByText('写入 1 条')).toBeTruthy();

    fireEvent.click(screen.getByText('写入 1 条'));

    await waitFor(() => {
      expect(createKbEntry).toHaveBeenCalledTimes(1);
    });
    expect(createKbEntry).toHaveBeenCalledWith({
      title: '门店规则',
      content: '午餐按 10-14 点统计',
      category: 'analytics',
      source: 'extracted',
      source_session_id: 'session-1',
    });
    expect(await screen.findByText('已写入 1 条。')).toBeTruthy();
  });
});
