import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { notification } from 'antd';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '../api/client';
import { resumeAgentRun } from '../api/agentRuns';
import { createId } from '../utils/id';
import type { TaskRecord } from '../types/task';
import { TaskCard } from './TaskCard';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../api/agentRuns', () => ({
  resumeAgentRun: vi.fn(),
}));

vi.mock('../utils/id', () => ({
  createId: vi.fn(() => 'request-1'),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    notification: {
      ...actual.notification,
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: '1',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    session_id: 'session-1',
    task_type: 'finance_report',
    status: 'completed',
    task_id: 'task-1',
    celery_task_id: null,
    meta: {
      filename: '财务报表.xlsx',
      download_url: '/api/v1/reports/download/1',
    },
    created_at: '2026-07-03T10:00:00+08:00',
    updated_at: '2026-07-03T10:01:00+08:00',
    ...overrides,
  };
}

describe('TaskCard', () => {
  beforeAll(() => {
    URL.createObjectURL = vi.fn(() => 'blob:report');
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createId).mockReset();
    vi.mocked(createId).mockReturnValue('request-1');
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['report'])),
      headers: new Headers({ 'Content-Disposition': "attachment; filename*=UTF-8''%E8%B4%A2%E5%8A%A1%E6%8A%A5%E8%A1%A8.xlsx" }),
    } as Response);
  });

  it('downloads completed report exports', async () => {
    render(<TaskCard task={task()} />);

    fireEvent.click(screen.getByText('下载 Excel'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/v1/reports/download/1');
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report');
    expect(notification.success).toHaveBeenCalledWith(expect.objectContaining({
      message: '下载已开始',
      duration: 5,
      closable: true,
    }));
  });

  it('retries retryable failed file parsing tasks', async () => {
    render(<TaskCard task={task({
      task_type: 'file_parsing',
      status: 'failed',
      meta: {
        file_results: [
          { filename: '美团.xlsx', status: 'failed', error: '内存不足' },
          { filename: '现金.xlsx', status: 'pending', error: '尚未处理' },
        ],
        retryable_files: [
          { filename: '美团.xlsx', file_path: '/tmp/mt.xlsx' },
        ],
      },
    })} />);

    fireEvent.click(screen.getByText('重试失败文件'));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/v1/tasks/task-1/retry-files', { method: 'POST' });
    });
    expect(notification.success).toHaveBeenCalledWith(expect.objectContaining({
      duration: 5,
      closable: true,
    }));
  });

  it('shows the persisted failure detail for a failed general conversation', () => {
    render(<TaskCard task={task({
      task_type: 'general_graph',
      status: 'failed',
      meta: {
        run_status: 'failed',
        failure_reason: 'model_failed',
        failure_detail: '模型服务暂时未响应，请稍后重试。',
      },
    })} />);

    expect(screen.getByText('智能问答')).toBeTruthy();
    expect(screen.getByText('模型服务暂时未响应，请稍后重试。')).toBeTruthy();
  });

  it('shows export for a cached reconciliation task', () => {
    render(<TaskCard task={task({
      task_type: 'reconciliation',
      meta: {
        cached: true,
        has_export: true,
        period: '2026-07',
        platform_count: 10,
      },
    })} />);

    expect(screen.getByRole('button', { name: '下载 Excel' })).toBeTruthy();
  });

  it('shows an error notification when file retry fails', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    render(<TaskCard task={task({
      task_type: 'file_parsing',
      status: 'failed',
      meta: {
        file_results: [{ filename: '美团.xlsx', status: 'failed', error: '内存不足' }],
        retryable_files: [{ filename: '美团.xlsx', file_path: '/tmp/mt.xlsx' }],
      },
    })} />);

    fireEvent.click(screen.getByRole('button', { name: '重试失败文件' }));

    await waitFor(() => {
      expect(notification.error).toHaveBeenCalledWith(expect.objectContaining({
        duration: 5,
        closable: true,
      }));
    });
  });

  it('uses platform_count and displays unmatched bank rows separately', () => {
    render(<TaskCard task={task({
      task_type: 'reconciliation',
      meta: {
        period: '2026-07',
        platform_count: 7,
        exact_matched: 2,
        fuzzy_matched: 1,
        needs_review: 4,
        unmatched_bank_count: 2,
      },
    })} />);

    expect(screen.getByText(/平台 7条/)).toBeTruthy();
    expect(screen.getByText('银行单边待复核 2条')).toBeTruthy();
    expect(screen.queryByText(/平台 7条.*银行单边/)).toBeNull();
  });

  it.each([
    ['waiting_for_data', '等待补充资料'],
    ['waiting_for_approval', '等待审批'],
    ['validating', '正在校验结果'],
    ['needs_review', '待人工复核'],
    ['completed', '研究完成'],
    ['failed', '研究失败'],
    ['cancelled', '研究已取消'],
  ])('shows research run status %s', (runStatus, label) => {
    render(<TaskCard task={task({
      task_type: 'research',
      status: runStatus === 'completed' ? 'completed' : runStatus === 'failed' ? 'failed' : 'running',
      meta: { run_status: runStatus },
    })} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it('shows a safe data-waiting state and resumes once with supplied information', async () => {
    const onResearchResume = vi.fn();
    const result = {
      accepted: true,
      run_id: 'task-1',
      run_status: 'queued' as const,
      task_status: 'running',
      event_cursor: 7,
    };
    vi.mocked(resumeAgentRun).mockResolvedValue(result);
    render(<TaskCard task={task({
      task_type: 'research',
      status: 'running',
      meta: {
        run_status: 'waiting_for_data',
        waiting_reason: '请补充缺失月份的线下流水。',
      },
    })} onResearchResume={onResearchResume} />);

    expect(screen.getByText('等待补充资料')).toBeTruthy();
    expect(screen.getByText('请补充缺失月份的线下流水。')).toBeTruthy();
    expect(screen.queryByText('waiting_for_data')).toBeNull();
    const textarea = screen.getByRole('textbox');
    const resume = screen.getByRole('button', { name: '补充资料并继续' });
    expect(resume).toHaveProperty('disabled', true);

    fireEvent.change(textarea, { target: { value: '补充线下流水已就绪' } });
    fireEvent.click(resume);

    await waitFor(() => {
      expect(resumeAgentRun).toHaveBeenCalledWith('task-1', 'request-1', '补充线下流水已就绪');
    });
    await waitFor(() => expect(onResearchResume).toHaveBeenCalledWith(expect.objectContaining({ task_id: 'task-1' }), result));
    expect(createId).toHaveBeenCalledTimes(1);
    expect(textarea).toHaveProperty('value', '');
    expect(notification.success).toHaveBeenCalledWith(expect.objectContaining({
      duration: 5,
      closable: true,
    }));
  });

  it('submits a pending resume only once and restores controls on failure', async () => {
    let rejectResume: (error: Error) => void = () => undefined;
    vi.mocked(resumeAgentRun).mockReturnValue(new Promise((_, reject) => {
      rejectResume = reject;
    }));
    render(<TaskCard task={task({
      task_type: 'research',
      status: 'running',
      meta: { run_status: 'waiting_for_data' },
    })} />);

    const textarea = screen.getByRole('textbox');
    const resume = screen.getByRole('button', { name: '补充资料并继续' });
    const cancel = screen.getByRole('button', { name: '取消研究' });
    fireEvent.change(textarea, { target: { value: '资料已准备' } });
    fireEvent.click(resume);
    fireEvent.click(resume);

    expect(resumeAgentRun).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveProperty('disabled', true);
    rejectResume(new Error('研究任务恢复失败'));

    await waitFor(() => expect(resume).toHaveProperty('disabled', false));
    expect(cancel).toHaveProperty('disabled', false);
    expect(notification.error).toHaveBeenCalledWith(expect.objectContaining({
      duration: 5,
      closable: true,
    }));
  });

  it('reuses the resume request ID after a transport failure', async () => {
    vi.mocked(createId)
      .mockReturnValueOnce('request-1')
      .mockReturnValueOnce('request-2');
    vi.mocked(resumeAgentRun)
      .mockRejectedValueOnce(new Error('网络错误'))
      .mockResolvedValueOnce({
        accepted: true,
        run_id: 'task-1',
        run_status: 'queued',
        task_status: 'pending',
        event_cursor: 8,
      });
    render(<TaskCard task={task({
      task_type: 'research',
      status: 'running',
      meta: { run_status: 'waiting_for_data' },
    })} />);

    const textarea = screen.getByRole('textbox');
    const resume = screen.getByRole('button', { name: '补充资料并继续' });
    fireEvent.change(textarea, { target: { value: '资料已准备' } });
    fireEvent.click(resume);
    await waitFor(() => expect(resumeAgentRun).toHaveBeenCalledTimes(1));
    fireEvent.click(resume);
    await waitFor(() => expect(resumeAgentRun).toHaveBeenCalledTimes(2));

    expect(vi.mocked(resumeAgentRun).mock.calls.map((call) => call[1])).toEqual(['request-1', 'request-1']);
  });

  it('shows an actionable manual-review card for unsafe research pauses', async () => {
    const onResearchResume = vi.fn();
    const result = {
      accepted: true,
      run_id: 'task-1',
      run_status: 'queued' as const,
      task_status: 'running',
      event_cursor: 9,
    };
    vi.mocked(resumeAgentRun).mockResolvedValue(result);
    render(<TaskCard task={task({
      task_type: 'research',
      status: 'running',
      meta: {
        run_status: 'needs_review',
        review_reason: 'invalid_tool_call',
      },
    })} onResearchResume={onResearchResume} />);

    expect(screen.getByText('待人工复核')).toBeTruthy();
    expect(screen.getByText(/模型请求了当前研究不允许使用的工具/)).toBeTruthy();
    expect(screen.queryByText('需要补充与本次经营研究相关的资料后才能继续。')).toBeNull();
    const textarea = screen.getByRole('textbox', { name: '复核说明' });
    const resume = screen.getByRole('button', { name: '确认继续' });
    expect(resume).toHaveProperty('disabled', true);

    fireEvent.change(textarea, { target: { value: '确认工具契约已修正，可以继续只读研究' } });
    fireEvent.click(resume);

    await waitFor(() => {
      expect(resumeAgentRun).toHaveBeenCalledWith('task-1', 'request-1', '确认工具契约已修正，可以继续只读研究');
    });
    await waitFor(() => expect(onResearchResume).toHaveBeenCalledWith(expect.objectContaining({ task_id: 'task-1' }), result));
    expect(notification.success).toHaveBeenCalledWith(expect.objectContaining({
      message: '已提交复核说明，研究将继续',
      duration: 5,
      closable: true,
    }));
  });

  it('allows cancelling a manual-review research task', () => {
    const onResearchCancel = vi.fn();
    render(<TaskCard task={task({
      task_type: 'research',
      status: 'running',
      meta: {
        run_status: 'needs_review',
        review_reason: 'model_runtime_error',
      },
    })} onResearchCancel={onResearchCancel} />);

    fireEvent.click(screen.getByRole('button', { name: '取消研究' }));

    expect(screen.getByText(/模型服务调用失败/)).toBeTruthy();
    expect(onResearchCancel).toHaveBeenCalledWith(expect.objectContaining({ task_id: 'task-1' }));
  });

  it('delegates cancellation to the parent confirmation flow', () => {
    const onResearchCancel = vi.fn();
    render(<TaskCard task={task({
      task_type: 'research',
      status: 'running',
      meta: { run_status: 'waiting_for_data' },
    })} onResearchCancel={onResearchCancel} />);

    fireEvent.click(screen.getByRole('button', { name: '取消研究' }));

    expect(onResearchCancel).toHaveBeenCalledWith(expect.objectContaining({ task_id: 'task-1' }));
  });
});
