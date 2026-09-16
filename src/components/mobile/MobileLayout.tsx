import type { ReactNode } from 'react';
import { useState } from 'react';
import { NavBar, Popup, SafeArea, TabBar, Toast } from 'antd-mobile';
import { useAuthStore } from '../../store/authStore';
import { type AppRoute, useUiStore } from '../../store/uiStore';

type MobileTabKey = 'chat' | 'tasks' | 'kb' | 'analytics' | 'more';
type MoreItem = {
  label: string;
  description: string;
  icon: ReactNode;
  route?: AppRoute;
  danger?: boolean;
  onClick?: () => void;
};

const routeTitles: Record<AppRoute, string> = {
  chat: '对话',
  tasks: '任务',
  kb: '知识库',
  connectors: '连接器',
  analytics: '经营分析',
  profile: '个人中心',
  'profile.settings': '个人设置',
  admin: '管理后台',
  'admin-users': '用户管理',
  'admin-connectors': '连接器后台',
  'admin-automation': '自动化与消息',
};

function mobileTabIcon(type: MobileTabKey, active: boolean) {
  const cls = `h-5 w-5 ${active ? 'text-blue-600' : 'text-slate-400'}`;
  if (type === 'chat') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m8-2a8 8 0 01-8 8H6l-4 3 1.4-5.6A8 8 0 1112 20z" />
      </svg>
    );
  }
  if (type === 'tasks') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    );
  }
  if (type === 'kb') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" />
      </svg>
    );
  }
  if (type === 'analytics') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M9 17V9m4 8V5m4 12v-6" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" />
    </svg>
  );
}

function menuIcon(type: 'analytics' | 'connectors' | 'admin' | 'users' | 'automation' | 'profile' | 'logout') {
  const cls = type === 'logout' ? 'h-5 w-5 text-red-500' : 'h-5 w-5 text-blue-600';
  if (type === 'analytics') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M9 17V9m4 8V5m4 12v-6" />
      </svg>
    );
  }
  if (type === 'connectors') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 16h10M9 4h6a2 2 0 012 2v12a2 2 0 01-2 2H9a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </svg>
    );
  }
  if (type === 'users') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-8 0v2M12 11a4 4 0 100-8 4 4 0 000 8zm6-1a3 3 0 110-6 3 3 0 010 6zm2 11v-2a4 4 0 00-3-3.87" />
      </svg>
    );
  }
  if (type === 'automation') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h10M4 17h10m4-10h2m-2 10h2M9 12h11M4 12h1" />
      </svg>
    );
  }
  if (type === 'profile') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" />
      </svg>
    );
  }
  if (type === 'logout') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3m4-4l-4 4 4 4m5-12h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function activeMobileTab(route: AppRoute, isAdmin: boolean): MobileTabKey {
  if (route === 'chat' || route === 'tasks' || route === 'analytics') return route;
  if (route === 'kb' && isAdmin) return 'kb';
  return 'more';
}

export function MobileLayout({ children }: { children: ReactNode }) {
  const { route, navigate } = useUiStore();
  const {
    role,
    username,
    workspaceType,
    activeWorkspaceId,
    workspaces,
    switchingWorkspaceId,
    switchWorkspace,
    logout,
  } = useAuthStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = role === 'admin';
  const isTenantWorkspace = workspaceType === 'tenant';
  const activeKey = activeMobileTab(route, isAdmin);

  function go(nextRoute: AppRoute) {
    setMoreOpen(false);
    navigate(nextRoute);
  }

  function onTabChange(key: string) {
    if (key === 'more') {
      setMoreOpen(true);
      return;
    }
    go(key as AppRoute);
  }

  async function changeWorkspace(workspaceId: string) {
    try {
      await switchWorkspace(workspaceId);
      setMoreOpen(false);
    } catch (error) {
      Toast.show({ content: error instanceof Error ? error.message : '工作空间切换失败' });
    }
  }

  const moreItems: MoreItem[] = [
    ...(isTenantWorkspace ? [
      { label: '连接器设置', description: '配置钉钉、食亨等数据源', route: 'connectors' as AppRoute, icon: menuIcon('connectors') },
    ] : []),
    ...(isTenantWorkspace && isAdmin ? [
      { label: '管理后台', description: '查看租户概览和管理入口', route: 'admin' as AppRoute, icon: menuIcon('admin') },
      { label: '用户管理', description: '审批成员与权限', route: 'admin-users' as AppRoute, icon: menuIcon('users') },
      { label: '连接器后台', description: '维护企业数据连接配置', route: 'admin-connectors' as AppRoute, icon: menuIcon('connectors') },
      { label: '自动化与消息', description: '配置定时推送和钉钉消息', route: 'admin-automation' as AppRoute, icon: menuIcon('automation') },
    ] : []),
    { label: '个人设置', description: '账号、租户和偏好设置', route: 'profile.settings', icon: menuIcon('profile') },
    { label: '退出登录', description: '退出当前账号', danger: true, onClick: () => { void logout(); }, icon: menuIcon('logout') },
  ];

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white md:hidden">
        <SafeArea position="top" />
        <NavBar
          back={null}
          backIcon={false}
          right={(
            <button
              type="button"
              className="flex h-9 min-w-9 items-center justify-center rounded-full bg-blue-50 px-2 text-xs font-semibold text-blue-700"
              onClick={() => setMoreOpen(true)}
              aria-label="打开更多菜单"
            >
              {username ? username.slice(0, 1).toUpperCase() : 'U'}
            </button>
          )}
        >
          <span className="text-sm font-semibold text-slate-800">{routeTitles[route]}</span>
        </NavBar>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {children}
      </div>

      <div className="border-t border-slate-200 bg-white md:hidden">
        <TabBar activeKey={activeKey} onChange={onTabChange} safeArea={false}>
          <TabBar.Item key="chat" title="对话" icon={active => mobileTabIcon('chat', active)} />
          {isTenantWorkspace && <TabBar.Item key="tasks" title="任务" icon={active => mobileTabIcon('tasks', active)} />}
          {isTenantWorkspace && isAdmin && <TabBar.Item key="kb" title="知识库" icon={active => mobileTabIcon('kb', active)} />}
          {isTenantWorkspace && <TabBar.Item key="analytics" title="经营旧版" icon={active => mobileTabIcon('analytics', active)} />}
          <TabBar.Item key="more" title="更多" icon={active => mobileTabIcon('more', active || activeKey === 'more')} />
        </TabBar>
        <SafeArea position="bottom" />
      </div>

      <Popup
        visible={moreOpen}
        onMaskClick={() => setMoreOpen(false)}
        onClose={() => setMoreOpen(false)}
        position="bottom"
        bodyClassName="rounded-t-2xl bg-white"
        closeOnSwipe
      >
        <div className="px-4 pb-3 pt-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-sm font-semibold text-blue-700">
              {username ? username.slice(0, 1).toUpperCase() : 'U'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{username || '用户'}</p>
              <p className="mt-0.5 text-xs text-slate-400">{workspaceRoleLabel(role)}</p>
            </div>
          </div>
          <p className="mb-1 px-1 text-[11px] font-medium text-slate-400">工作空间</p>
          <div className="mb-3 overflow-hidden rounded-2xl border border-slate-100">
            {workspaces.map((workspace) => (
              <button
                key={workspace.workspace_id}
                type="button"
                disabled={Boolean(switchingWorkspaceId)}
                onClick={() => void changeWorkspace(workspace.workspace_id)}
                className={`flex min-h-12 w-full items-center gap-3 border-b border-slate-100 px-3 text-left last:border-b-0 disabled:opacity-50 ${
                  workspace.workspace_id === activeWorkspaceId ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-700'
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{workspace.name}</span>
                <span className="text-xs text-slate-400">
                  {switchingWorkspaceId === workspace.workspace_id ? '切换中' : workspace.workspace_id === activeWorkspaceId ? '当前' : ''}
                </span>
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-sm">
            {moreItems.map((item, index) => (
              <button
                key={`${item.label}-${index}`}
                type="button"
                className={`flex min-h-16 w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 ${
                  item.danger ? 'text-red-600' : 'text-slate-700'
                }`}
                onClick={() => {
                  if (item.route) go(item.route);
                  if (item.onClick) {
                    setMoreOpen(false);
                    item.onClick();
                  }
                }}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.danger ? 'bg-red-50' : 'bg-blue-50'}`}>{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  <span className={`mt-0.5 block truncate text-xs ${item.danger ? 'text-red-400' : 'text-slate-400'}`}>{item.description}</span>
                </span>
                {!item.danger && <span className="text-slate-300">›</span>}
              </button>
            ))}
          </div>
          <SafeArea position="bottom" />
        </div>
      </Popup>
    </div>
  );
}

function workspaceRoleLabel(role: 'admin' | 'member' | 'personal'): string {
  if (role === 'admin') return '管理员';
  if (role === 'member') return '成员';
  return '个人空间';
}
