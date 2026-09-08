/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '../api/client';
import { useTaskStore } from '../store/taskStore';
import type { TaskRecord } from '../types/task';
import { TasksPage } from './TasksPage';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));

const researchTask = (runStatus: 'waiting_for_data' | 'waiting_for_approval' | 'needs_review'): TaskRecord => ({
  id: runStatus,
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  session_id: 'session-1',
  task_id: `run-${runStatus}`,
  task_type: 'research',
  status: 'running',
  celery_task_id: null,
  meta: { run_status: runStatus },
  created_at: '2026-08-10T10:00:00+08:00',
  updated_at: '2026-08-10T10:00:00+08:00',
});

describe('TasksPage research projection', () => {
  afterEach(() => {
    useTaskStore.getState().reset();
    vi.clearAllMocks();
  });

  it.each([
    ['waiting_for_data', '等待补充资料'],
    ['waiting_for_approval', '等待审批'],
    ['needs_review', '待人工复核'],
  ] as const)('shows Research Agent %s from its persisted run status', (runStatus, label) => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true, json: async () => [] } as Response);
    const task = researchTask(runStatus);
    useTaskStore.setState({ tasks: [task], selectedTaskId: task.task_id });

    render(<TasksPage />);

    expect(screen.getByRole('heading', { name: 'Research Agent' })).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
  });
});
