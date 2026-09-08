import {
  ApartmentOutlined,
  BarChartOutlined,
  CreditCardOutlined,
  DesktopOutlined,
  LogoutOutlined,
  TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Layout, Menu, type MenuProps } from 'antd';
import type { ReactNode } from 'react';
import { useAdminStore, type AdminRoute } from './adminStore';

const routeLabels: Record<Exclude<AdminRoute, 'login'>, string> = {
  dashboard: '系统总览',
  tenants: '租户管理',
  users: '用户管理',
  'task-logs': '任务日志',
  usage: '用量明细',
  billing: '计费规则',
};

const menuItems: MenuProps['items'] = [
  {
    type: 'group',
    label: '工作台',
    children: [{ key: 'dashboard', icon: <span aria-hidden="true"><DesktopOutlined /></span>, label: '系统总览' }],
  },
  {
    type: 'group',
    label: '租户与账号',
    children: [
      { key: 'tenants', icon: <span aria-hidden="true"><ApartmentOutlined /></span>, label: '租户管理' },
      { key: 'users', icon: <span aria-hidden="true"><TeamOutlined /></span>, label: '用户管理' },
    ],
  },
  {
    type: 'group',
    label: '运行监控',
    children: [
      { key: 'task-logs', icon: <span aria-hidden="true"><UnorderedListOutlined /></span>, label: '任务日志' },
      { key: 'usage', icon: <span aria-hidden="true"><BarChartOutlined /></span>, label: '用量明细' },
    ],
  },
  {
    type: 'group',
    label: '平台配置',
    children: [{ key: 'billing', icon: <span aria-hidden="true"><CreditCardOutlined /></span>, label: '计费规则' }],
  },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, route, navigate, logout } = useAdminStore();
  const currentRoute = route === 'login' ? 'dashboard' : route;

  return (
    <Layout hasSider className="h-dvh overflow-hidden bg-slate-100">
      <Layout.Sider
        width={216}
        theme="light"
        breakpoint="lg"
        collapsedWidth={0}
        className="border-r border-slate-200 bg-white"
      >
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-sm font-semibold text-white">运</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">平台运维</div>
            <div className="truncate text-xs text-slate-500">餐饮 Agent</div>
          </div>
        </div>
        <nav aria-label="平台管理导航" className="h-[calc(100%-56px)] overflow-y-auto py-3">
          <Menu
            mode="inline"
            selectedKeys={[currentRoute]}
            items={menuItems}
            onClick={({ key }) => navigate(key as AdminRoute)}
            className="border-e-0"
          />
        </nav>
      </Layout.Sider>
      <Layout className="min-w-0 bg-slate-100">
        <Layout.Header
          className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-5 lg:px-6"
          style={{ height: 56, lineHeight: 'normal' }}
        >
          <div className="min-w-0">
            <div className="text-xs text-slate-400">平台管理</div>
            <div className="truncate text-sm font-medium text-slate-800">{routeLabels[currentRoute]}</div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Avatar size="small" className="bg-blue-600">{admin?.username.slice(0, 1).toUpperCase() || 'A'}</Avatar>
            <span className="hidden text-sm text-slate-600 sm:inline">{admin?.username || '平台管理员'}</span>
            <Button type="text" icon={<LogoutOutlined />} onClick={logout}>
              退出
            </Button>
          </div>
        </Layout.Header>
        <main className="min-w-0 flex-1 overflow-auto bg-slate-100 px-5 py-5 lg:px-6">
          {children}
        </main>
      </Layout>
    </Layout>
  );
}
