import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../../api/client';
import { useTaskStore } from '../taskStore';
import type { TaskRecord } from '../../types/task';
import { taskRunStatus } from '../../types/task';

const mockApiFetch = vi.mocked(apiFetch);
const OWNER = 'research-task-polling-test';

function task(runStatus: string): TaskRecord {
  return {
    id: 'internal-1',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    session_id: 'session-1',
    task_type: 'research',
    status: runStatus === 'completed' ? 'completed' : 'running',
    task_id: 'run-1',
    celery_task_id: null,
    meta: { run_status: runStatus },
    created_at: '2026-08-10T10:00:00+08:00',
    updated_at: '2026-08-10T10:00:00+08:00',
  };
}

function legacyTask(status: TaskRecord['status']): TaskRecord {
  return {
    ...task('completed'),
    id: 'legacy-internal-1',
    task_id: 'legacy-task-1',
    task_type: 'reconciliation',
    status,
    meta: null,
  };
}

function response(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

describe('research task polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTaskStore.getState().reset();
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    useTaskStore.getState().stopPolling(OWNER);
    vi.useRealTimers();
  });

  it.each(['queued', 'running', 'validating'])('%s remains actively polled', async (status) => {
    mockApiFetch.mockResolvedValue(response([task(status)]));

    useTaskStore.getState().startPolling(OWNER, { type: 'global' });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(taskRunStatus(task(status))).toBe(status);
  });

  it.each([
    'waiting_for_data',
    'waiting_for_approval',
    'needs_review',
    'completed',
    'failed',
    'cancelled',
  ])('%s does not poll continuously', async (status) => {
    mockApiFetch.mockResolvedValue(response([task(status)]));

    useTaskStore.getState().startPolling(OWNER, { type: 'global' });
    await vi.advanceTimersByTimeAsync(9_000);

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(taskRunStatus(task(status))).toBe(status);
  });

  it.each([
    ['an empty list', []],
    ['legacy terminal tasks', [legacyTask('completed'), legacyTask('failed')]],
  ])('stops polling after %s', async (_name, tasks) => {
    mockApiFetch.mockResolvedValue(response(tasks));

    useTaskStore.getState().startPolling(OWNER, { type: 'global' });
    await vi.advanceTimersByTimeAsync(9_000);

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps polling an active legacy task alongside waiting research', async () => {
    mockApiFetch.mockResolvedValue(response([
      task('waiting_for_data'),
      legacyTask('running'),
    ]));

    useTaskStore.getState().startPolling(OWNER, { type: 'global' });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});
