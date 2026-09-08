import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { KnowledgeEntryEditor } from './KnowledgeEntryEditor';

describe('KnowledgeEntryEditor', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverMock });
    Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverMock });
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

  it('validates required fields before saving', () => {
    render(<KnowledgeEntryEditor entry={null} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByText('保存'));

    expect(screen.getByText('标题与内容不能为空')).toBeTruthy();
  });

  it('saves a new knowledge entry with trimmed values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <KnowledgeEntryEditor
        entry={null}
        onClose={onClose}
        onSave={onSave}
        defaultCategory="product"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('一句话概括，例如：门店退款政策'), {
      target: { value: '  产品规则  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('自包含的事实表述，脱离原对话也能读懂'), {
      target: { value: '  员工餐不计入产品分析  ' },
    });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        title: '产品规则',
        content: '员工餐不计入产品分析',
        category: 'product',
      });
    });
    expect(onClose).toHaveBeenCalled();
  });
});
