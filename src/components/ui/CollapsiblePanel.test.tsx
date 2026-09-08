import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CollapsiblePanel } from './CollapsiblePanel';

describe('CollapsiblePanel', () => {
  it('expands and collapses content', () => {
    const onExpand = vi.fn();

    render(
      <CollapsiblePanel title="任务详情" summary="3 条记录" defaultCollapsed onExpand={onExpand}>
        <p>已完成</p>
      </CollapsiblePanel>,
    );

    expect(screen.queryByText('已完成')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /任务详情/ }));

    expect(onExpand).toHaveBeenCalled();
    expect(screen.getByText('已完成')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /任务详情/ }));

    expect(screen.queryByText('已完成')).toBeNull();
  });
});
