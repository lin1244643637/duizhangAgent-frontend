import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalModal } from './ApprovalModal';
import { ConfirmDialog } from './ConfirmDialog';

describe('AntD-backed modal wrappers', () => {
  it('ApprovalModal keeps approval actions wired', () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn();

    render(
      <ApprovalModal
        request={{ action: 'run-sync', description: '执行同步任务', turnId: 'turn-1' }}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('需要确认')).toBeTruthy();
    expect(screen.getByText('执行同步任务')).toBeTruthy();
    fireEvent.click(screen.getByText('同意执行'));
    expect(onApprove).toHaveBeenCalledWith('run-sync');
    fireEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('ConfirmDialog keeps confirm and cancel callbacks wired', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        title="删除确认"
        message="确认删除这条记录？"
        confirmLabel="删除"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('删除确认')).toBeTruthy();
    expect(screen.getByText('确认删除这条记录？')).toBeTruthy();
    fireEvent.click(screen.getByText('删除'));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalled();
  });
});
