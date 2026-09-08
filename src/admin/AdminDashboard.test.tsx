import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPlatformHealth,
  listDaily,
  listPlatformTasks,
  listPlatformTenants,
  listPlatformUsers,
  listSummaries,
  recomputePeriod,
} from './adminApi';
import { AdminDashboard } from './AdminDashboard';

vi.mock('./adminApi', () => ({
  getPlatformHealth: vi.fn(),
  listDaily: vi.fn(),
  listPlatformTasks: vi.fn(),
  listPlatformTenants: vi.fn(),
  listPlatformUsers: vi.fn(),
  listSummaries: vi.fn(),
  recomputePeriod: vi.fn(),
}));

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.mocked(getPlatformHealth).mockReset();
    vi.mocked(listDaily).mockReset();
    vi.mocked(listPlatformTasks).mockReset();
    vi.mocked(listPlatformTenants).mockReset();
    vi.mocked(listPlatformUsers).mockReset();
    vi.mocked(listSummaries).mockReset();
    vi.mocked(recomputePeriod).mockReset();

    vi.mocked(getPlatformHealth).mockRejectedValue(new Error('network unavailable'));
    vi.mocked(recomputePeriod).mockResolvedValue({ period: '2026-08', rows: 0 });
    vi.mocked(listSummaries).mockResolvedValue([]);
    vi.mocked(listDaily).mockResolvedValue([]);
    vi.mocked(listPlatformTenants).mockResolvedValue({ tenants: [], total: 3 });
    vi.mocked(listPlatformUsers).mockResolvedValue({ users: [], total: 12 });
    vi.mocked(listPlatformTasks)
      .mockResolvedValueOnce({ tasks: [], total: 2 })
      .mockResolvedValueOnce({ tasks: [], total: 1 });
  });

  it('keeps the dashboard usable when the health check is unavailable', async () => {
    render(<AdminDashboard />);

    await screen.findByText('健康检查不可用');
    expect(screen.getByText('运行关注')).toBeTruthy();
    expect(screen.getByRole('region', { name: '关键指标' }).textContent).toContain('失败任务2');
    expect(screen.getByRole('region', { name: '关键指标' }).textContent).toContain('运行任务1');
    expect(screen.getByRole('region', { name: '关键指标' }).textContent).toContain('用户数12');
    await waitFor(() => {
      expect(listPlatformTasks).toHaveBeenNthCalledWith(1, { status: 'failed', limit: 5 });
      expect(listPlatformTasks).toHaveBeenNthCalledWith(2, { status: 'running', limit: 1 });
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
