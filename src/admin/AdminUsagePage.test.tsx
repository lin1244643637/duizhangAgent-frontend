import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listUsage, listUsageTenants } from './adminApi';
import { AdminUsagePage } from './AdminUsagePage';

vi.mock('./adminApi', () => ({
  listUsage: vi.fn(),
  listUsageTenants: vi.fn(),
}));

describe('AdminUsagePage', () => {
  beforeEach(() => {
    vi.mocked(listUsage).mockReset();
    vi.mocked(listUsageTenants).mockReset();
    vi.mocked(listUsageTenants).mockResolvedValue(['tenant-1']);
    vi.mocked(listUsage).mockResolvedValue({
      total: 2,
      items: [
        {
          id: 1,
          tenant_id: 'tenant-1',
          username: 'admin',
          provider: 'anthropic',
          model: 'claude-sonnet',
          cache_read_input_tokens: 1200,
          cache_write_input_tokens: 300,
          uncached_input_tokens: 400,
          output_tokens: 200,
          estimated: false,
          created_at: '2026-08-05T10:00:00+08:00',
        },
        {
          id: 2,
          tenant_id: 'tenant-1',
          username: 'operator',
          provider: 'anthropic',
          model: 'claude-sonnet',
          cache_read_input_tokens: 800,
          cache_write_input_tokens: 100,
          uncached_input_tokens: 600,
          output_tokens: 300,
          estimated: true,
          created_at: '2026-08-05T10:01:00+08:00',
        },
      ],
    });
  });

  it('shows current-result metrics without presenting a daily trend', async () => {
    render(<AdminUsagePage />);

    await screen.findByText('admin');
    expect(screen.getByRole('region', { name: '关键指标' }).textContent).toContain('本页记录2');
    expect(screen.getByRole('region', { name: '关键指标' }).textContent).toContain('缓存输入2,400');
    expect(screen.getByRole('region', { name: '关键指标' }).textContent).toContain('未命中输入1,000');
    expect(screen.getByRole('region', { name: '关键指标' }).textContent).toContain('输出 token500');
    expect(screen.getByRole('region', { name: '关键指标' }).textContent).toContain('估算记录1');
    expect(screen.queryByText('按日金额趋势')).toBeNull();
  });
});
