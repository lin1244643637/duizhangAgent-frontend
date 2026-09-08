import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPlatformTenant,
  deletePlatformTenant,
  listPlatformTenants,
  regeneratePlatformTenantCode,
  updatePlatformTenant,
} from './adminApi';
import { PlatformTenantsPage } from './PlatformTenantsPage';

vi.mock('./adminApi', () => ({
  createPlatformTenant: vi.fn(),
  deletePlatformTenant: vi.fn(),
  listPlatformTenants: vi.fn(),
  regeneratePlatformTenantCode: vi.fn(),
  updatePlatformTenant: vi.fn(),
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

describe('PlatformTenantsPage', () => {
  beforeEach(() => {
    vi.mocked(listPlatformTenants).mockReset();
    vi.mocked(createPlatformTenant).mockReset();
    vi.mocked(updatePlatformTenant).mockReset();
    vi.mocked(regeneratePlatformTenantCode).mockReset();
    vi.mocked(deletePlatformTenant).mockReset();
    vi.mocked(listPlatformTenants).mockResolvedValue({ tenants: [tenant], total: 1 });
  });

  it('opens the tenant form in a drawer and keeps the search after it closes', async () => {
    render(<PlatformTenantsPage />);
    await screen.findByText('袁记餐饮');

    fireEvent.change(screen.getByPlaceholderText('搜索租户名称'), { target: { value: '袁记' } });
    await waitFor(() => expect(listPlatformTenants).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '新建租户' }));

    expect(screen.getByRole('dialog').textContent).toContain('新建租户');
    fireEvent.click(screen.getByLabelText('关闭详情抽屉'));
    expect(screen.getByDisplayValue('袁记')).toBeTruthy();
  });
});
