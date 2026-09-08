import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FloatingNotice } from './FloatingNotice';

describe('FloatingNotice', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders notice content and closes manually', () => {
    const onClose = vi.fn();

    render(<FloatingNotice notice={{ message: '保存成功', variant: 'success' }} onClose={onClose} />);

    expect(screen.getByText('保存成功')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('关闭提示'));

    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the custom close label for chat notices', () => {
    render(
      <FloatingNotice
        notice={{ message: '保存知识失败', variant: 'error' }}
        onClose={vi.fn()}
        closeLabel="关闭"
      />,
    );

    expect(screen.getByText('关闭')).toBeTruthy();
  });

  it('auto closes after the configured duration', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    render(<FloatingNotice notice={{ message: '稍后消失', variant: 'info' }} onClose={onClose} durationMs={1200} />);

    vi.advanceTimersByTime(1199);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalled();
  });
});
