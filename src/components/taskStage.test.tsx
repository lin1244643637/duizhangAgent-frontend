import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskRecord } from '../types/task';
import { TaskCard } from './TaskCard';
import { TaskListPanel } from './TaskListPanel';
import { TasksPage } from './TasksPage';

const taskStore = vi.hoisted(() => ({
  deleteTask: vi.fn(),
  selectTask: vi.fn(),
  selectedTaskId: null as string | null,
  startPolling: vi.fn(),
  stopPolling: vi.fn(),
  tasks: [] as unknown[],
}));

vi.mock('../store/taskStore', () => ({
  GLOBAL_TASK_POLL_SCOPE: { limit: 100 },
  useTaskStore: () => taskStore,
}));

function stage(overrides: Record<string, unknown> = {}) {
  return {
    code: 'validating',
    label: '校验流水',
    detail: '正在检查账期完整性',
    status: 'running',
    current: 2,
    total: 5,
    ...overrides,
  };
}

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: '1',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    session_id: 'session-1',
    task_type: 'finance_report',
    status: 'running',
    task_id: 'task-1',
    celery_task_id: null,
    meta: { stage: stage() },
    created_at: '2026-08-03T09:59:00+08:00',
    updated_at: '2026-08-03T10:00:00+08:00',
    ...overrides,
  };
}

describe('task stage presentation', () => {
  beforeEach(() => {
    taskStore.tasks = [];
    taskStore.selectedTaskId = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a valid stage with accessible progress and rejects malformed core fields', () => {
    const { rerender } = render(<TaskCard task={task()} />);

    expect(screen.getByText('校验流水')).toBeTruthy();
    expect(screen.getByText('正在检查账期完整性')).toBeTruthy();
    const progress = screen.getByRole('progressbar', { name: '校验流水进度' });
    expect(progress.getAttribute('aria-valuemin')).toBe('0');
    expect(progress.getAttribute('aria-valuemax')).toBe('5');
    expect(progress.getAttribute('aria-valuenow')).toBe('2');
    expect(progress.textContent).toContain('2 / 5');

    const invalidStages = [
      stage({ code: '' }),
      stage({ label: 1 }),
      stage({ detail: null }),
      stage({ status: 'paused' }),
      stage({ current: '2' }),
      stage({ total: 0 }),
    ];

    for (const invalidStage of invalidStages) {
      rerender(<TaskCard task={task({ meta: { stage: invalidStage } })} />);
      expect(screen.getByText('财务报表进行中…')).toBeTruthy();
      expect(screen.queryByRole('progressbar')).toBeNull();
    }
  });

  it('shows a retrying stage in the task list', () => {
    taskStore.tasks = [task({
      status: 'retrying' as TaskRecord['status'],
      meta: {
        task_name: '连接器同步',
        stage: stage({ label: '重新拉取', detail: '第 2 次尝试', status: 'retrying', current: 1, total: 3 }),
      },
    })];
    taskStore.selectedTaskId = 'task-1';

    render(<TaskListPanel />);

    expect(screen.getByText('重新拉取')).toBeTruthy();
    expect(screen.getByText('第 2 次尝试')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '重新拉取进度' }).textContent).toContain('1 / 3');
  });

  it('shows the active stage in the task details result area', () => {
    taskStore.tasks = [task({
      task_type: 'reconciliation',
      meta: { stage: stage({ label: '匹配流水', detail: '正在执行精确匹配', current: 4, total: 10 }) },
    })];
    taskStore.selectedTaskId = 'task-1';

    render(<TasksPage />);

    expect(screen.getByText('匹配流水')).toBeTruthy();
    expect(screen.getByText('正在执行精确匹配')).toBeTruthy();
    const progress = screen.getByRole('progressbar', { name: '匹配流水进度' });
    expect(progress.getAttribute('aria-valuenow')).toBe('4');
    expect(progress.getAttribute('aria-valuemax')).toBe('10');
  });

  it('updates elapsed time every ten seconds and clears the timer on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T10:01:00+08:00'));
    const clearInterval = vi.spyOn(window, 'clearInterval');
    const { unmount } = render(<TaskCard task={task({
      meta: { stage: stage({ started_at: '2026-08-03T10:00:00+08:00' }) },
    })} />);

    expect(screen.getByText('已耗时 1分 0秒')).toBeTruthy();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('已耗时 1分 10秒')).toBeTruthy();

    unmount();
    expect(clearInterval).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
