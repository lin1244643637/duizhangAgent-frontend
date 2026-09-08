import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLayout } from './AdminLayout';
import { useAdminStore } from './adminStore';

describe('AdminLayout', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    navigate.mockReset();
    useAdminStore.setState({
      admin: { id: 'admin-1', username: 'admin1' },
      route: 'dashboard',
      navigate,
      logout: vi.fn(),
    });
  });

  it('groups routes and sends navigation through the admin store', async () => {
    render(
      <AdminLayout>
        <div>内容</div>
      </AdminLayout>,
    );

    expect(screen.getByText('工作台')).toBeTruthy();
    expect(screen.getByText('租户与账号')).toBeTruthy();
    expect(screen.getByText('运行监控')).toBeTruthy();
    expect(screen.getByText('平台配置')).toBeTruthy();
    expect(screen.getByRole('main').textContent).toContain('内容');

    fireEvent.click(screen.getByRole('menuitem', { name: '租户管理' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('tenants'));
  });
});
