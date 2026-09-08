import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listPlatformTasks, listPlatformTenants } from './adminApi';
import { PlatformTaskLogsPage } from './PlatformTaskLogsPage';

vi.mock('./adminApi', () => ({
  listPlatformTasks: vi.fn(),
  listPlatformTenants: vi.fn(),
}));

const tenant = {
  id: 'tenant-1',
  brand_name: '袁记餐饮',
  tenant_code: 'YUANJI-01',
  store_count: 12,
  model_provider: 'anthropic',
  model_name: 'claude-sonnet-4-20250514',
  is_new_tenant: '0',
  user_count: 4,
  created_at: '2026-08-01T10:00:00+08:00',
};

const task = {
  id: 'task-row-1',
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  session_id: 'session-1',
  task_type: 'file_parsing',
  status: 'failed',
  task_id: 'job-1',
  celery_task_id: 'celery-1',
  meta: { agent_message: '文件字段无法识别', detail: 'column A' },
  created_at: '2026-08-01T10:00:00+08:00',
  updated_at: '2026-08-01T10:01:00+08:00',
};

describe('PlatformTaskLogsPage', () => {
  beforeEach(() => {
    vi.mocked(listPlatformTenants).mockReset();
    vi.mocked(listPlatformTasks).mockReset();
    vi.mocked(listPlatformTenants).mockResolvedValue({ tenants: [tenant], total: 1 });
    vi.mocked(listPlatformTasks).mockResolvedValue({ tasks: [task], total: 1 });
  });

  it('filters by task type and opens the task detail drawer', async () => {
    render(<PlatformTaskLogsPage />);
    await screen.findByText('文件解析');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '任务类型' }));
    const taskTypeOptions = await screen.findAllByText('文件解析');
    fireEvent.click(taskTypeOptions[taskTypeOptions.length - 1]);
    await waitFor(() => expect(listPlatformTasks).toHaveBeenLastCalledWith(expect.objectContaining({ task_type: 'file_parsing' })));

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('文件字段无法识别')).toBeTruthy();
    expect(within(drawer).getByText('celery-1')).toBeTruthy();
  });
});
