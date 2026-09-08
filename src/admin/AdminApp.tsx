import { useEffect } from 'react';
import { ConfigProvider } from 'antd';
import { useAdminStore } from './adminStore';
import { AdminLoginPage } from './AdminLoginPage';
import { AdminLayout } from './AdminLayout';
import { AdminDashboard } from './AdminDashboard';
import { AdminUsagePage } from './AdminUsagePage';
import { AdminBillingRulesPage } from './AdminBillingRulesPage';
import { PlatformUsersPage } from './PlatformUsersPage';
import { PlatformTenantsPage } from './PlatformTenantsPage';
import { PlatformTaskLogsPage } from './PlatformTaskLogsPage';
import { platformAdminTheme } from './platformAdminTheme';

/**
 * 平台后台根组件。完全独立于租户 App，
 * 在 App.tsx 顶层根据 hash 是否以 #/platform/ 开头分流到此处。
 */
export function AdminApp() {
  const { isLoggedIn, route, refreshMe, navigate } = useAdminStore();

  // 已登录 → 拉一次 /me 校验 token；失败时 store 内部自动 logout
  useEffect(() => {
    if (isLoggedIn) void refreshMe();
  }, [isLoggedIn]);

  // 未登录但 hash 不是 login → 强制跳登录
  useEffect(() => {
    if (!isLoggedIn && route !== 'login') {
      navigate('login');
    }
  }, [isLoggedIn, route]);

  const page = !isLoggedIn || route === 'login' ? (
    <AdminLoginPage />
  ) : (
    <AdminLayout>
      {route === 'dashboard' && <AdminDashboard />}
      {route === 'users' && <PlatformUsersPage />}
      {route === 'tenants' && <PlatformTenantsPage />}
      {route === 'task-logs' && <PlatformTaskLogsPage />}
      {route === 'usage' && <AdminUsagePage />}
      {route === 'billing' && <AdminBillingRulesPage />}
    </AdminLayout>
  );

  return <ConfigProvider theme={platformAdminTheme}>{page}</ConfigProvider>;
}
