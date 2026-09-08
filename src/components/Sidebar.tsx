import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Button } from 'antd';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { TaskListPanel } from './TaskListPanel';
import { formatBeijingTime } from '../utils/time';

function formatTime(ts: number): string {
  return formatBeijingTime(ts, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SidebarIconButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative group">
      <Button
        htmlType="button"
        onClick={onClick}
        aria-label={label}
        className={`h-11 min-w-11 w-11 flex items-center justify-center rounded-2xl border-0 p-0 shadow-none transition-colors cursor-pointer ${
          active
            ? 'bg-blue-50 text-blue-700 border border-blue-100 shadow-sm'
            : 'text-slate-500 hover:text-blue-700 hover:bg-blue-50'
        }`}
      >
        {children}
      </Button>
      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </div>
  );
}

function UserMenu() {
  const { username, role, logout } = useAuthStore();
  const { route, navigate, closeUserMenu } = useUiStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        closeUserMenu();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closeUserMenu]);

  function handleNav(r: typeof route) {
    navigate(r);
    setMenuOpen(false);
  }

  function handleLogout() {
    setMenuOpen(false);
    logout();
  }

  // Get first char of username for avatar initial
  const initial = username ? username[0].toUpperCase() : 'U';

  return (
    <div className="relative" ref={menuRef}>
      <Button
        onClick={() => setMenuOpen(!menuOpen)}
        className="h-auto w-full flex items-center gap-2 border-0 px-2 py-2 rounded-xl shadow-none hover:bg-slate-100 transition-colors cursor-pointer"
      >
        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          {initial}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-slate-700 truncate">{username || '用户'}</p>
          <p className="text-[10px] text-slate-400">{role === 'admin' ? '管理员' : '成员'}</p>
        </div>
        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </Button>

      {menuOpen && (
        <div className="absolute bottom-full left-2 right-2 mb-1 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
          <div className="px-3 pt-1 pb-2 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-700">{username}</p>
            <p className="text-xs text-slate-400">{role === 'admin' ? '管理员' : '成员'}</p>
          </div>

          <Button
            onClick={() => handleNav('profile.settings')}
            className="h-auto w-full flex items-center gap-2.5 border-0 px-3 py-2.5 text-sm text-slate-600 shadow-none hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 011.52.36l-3.1 3.1a1.532 1.532 0 01.36 1.52c.38 1.56 2.6 1.56 2.98 0a1.532 1.532 0 01-.36-1.52l3.1-3.1A1.532 1.532 0 0111.49 3.17zm2.15 1.98c-.38 1.56-2.6 1.56-2.98 0a1.532 1.532 0 01-.36-1.52l-3.1 3.1a1.532 1.532 0 01.36 1.52c.38 1.56 2.6 1.56 2.98 0a1.532 1.532 0 01-.36-1.52l3.1-3.1A1.532 1.532 0 0113.64 5.15zm-6.3 10.33c.38-1.56 2.6-1.56 2.98 0 .38 1.55 2.6 0 4.3-3.1 1.56-1.56-1.56-2.6 0-2.6 0-1.56 2.6 2.98 2.6 2.98 0a1.532 1.532 0 01.36-1.52l-3.1-3.1a1.532 1.532 0 01.36-1.52c.38-1.56 2.6 1.56 4.3 0z" clipRule="evenodd" />
                <path d="M10 2a8 8 0 100 16 8 8 0 000-16z" />
            </svg>
            个人设置
          </Button>

          {role === 'admin' && (
            <Button
              onClick={() => handleNav('admin')}
              className="h-auto w-full flex items-center gap-2.5 border-0 px-3 py-2.5 text-sm text-slate-600 shadow-none hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
              </svg>
              管理后台
            </Button>
          )}

          <div className="my-1 border-t border-slate-100" />

          <Button
            onClick={handleLogout}
            className="h-auto w-full flex items-center gap-2.5 border-0 px-3 py-2.5 text-sm text-red-600 shadow-none hover:bg-red-50 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
            退出登录
          </Button>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { sessions, activeSessionId, setActiveSession, resetToNewSession, deleteSession } = useChatStore();
  const { navigate, route, sidebarCollapsed, toggleSidebarCollapsed } = useUiStore();
  const { role, username } = useAuthStore();
  const isAdmin = role === 'admin';
  const collapsedChatRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsedChatOpen, setCollapsedChatOpen] = useState(false);

  const visibleSessions = sessions.filter((s) => !s.pending);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (collapsedChatRef.current && !collapsedChatRef.current.contains(e.target as Node)) {
        setCollapsedChatOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleDelete(e: ReactMouseEvent, sessionId: string) {
    e.stopPropagation();
    setDeletingId(sessionId);
    await deleteSession(sessionId);
    setDeletingId(null);
  }

  function handleNewChat() {
    navigate('chat');
    setCollapsedChatOpen(false);
    resetToNewSession();
  }

  function handleOpenSession(sessionId: string) {
    navigate('chat');
    setActiveSession(sessionId);
    setCollapsedChatOpen(false);
  }

  const isChat = route === 'chat';
  const isTasks = route === 'tasks';
  const isKb = route === 'kb';
  const isAnalytics = route === 'analytics';
  const initial = username ? username[0].toUpperCase() : 'U';

  const chatIcon = (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m8-2a8 8 0 01-8 8H6l-4 3 1.4-5.6A8 8 0 1112 20z" />
    </svg>
  );
  const taskIcon = (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
  const kbIcon = (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" />
    </svg>
  );
  const analyticsIcon = (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M9 17V9m4 8V5m4 12v-6" />
    </svg>
  );
  return (
    <aside className={`${sidebarCollapsed ? 'w-[72px]' : 'w-60'} relative hidden flex-shrink-0 bg-white border-r border-slate-200 md:flex flex-col h-full transition-[width] duration-200 ease-out`}>
      {sidebarCollapsed ? (
        <>
          <div className="p-2 border-b border-slate-200 flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-blue-500 flex items-center justify-center flex-shrink-0" title="对账 Agent">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <SidebarIconButton label="展开侧边栏" onClick={toggleSidebarCollapsed}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M4 19h16M9 12h11M4 9v6m3-3l-3 3m0-6l3 3" />
              </svg>
            </SidebarIconButton>
            <div className="relative group">
              <Button
                htmlType="button"
                onClick={handleNewChat}
                aria-label="新对话"
                className="h-11 min-w-11 w-11 flex items-center justify-center rounded-2xl bg-blue-50 p-0 text-blue-700 border border-blue-100 hover:bg-blue-100 shadow-sm transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                </svg>
              </Button>
              <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                新对话
              </span>
            </div>
          </div>

          <div className="flex-1 py-3 flex flex-col items-center gap-2">
            <div className="relative" ref={collapsedChatRef}>
              <SidebarIconButton label="对话列表" active={isChat || collapsedChatOpen} onClick={() => setCollapsedChatOpen((v) => !v)}>
                {chatIcon}
              </SidebarIconButton>

              {collapsedChatOpen && (
                <div className="absolute left-full top-0 z-50 ml-3 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">对话列表</p>
                      <p className="text-xs text-slate-400">选择一个历史会话</p>
                    </div>
                    <Button
                      htmlType="button"
                      onClick={handleNewChat}
                      className="h-auto flex items-center gap-1.5 rounded-xl border-0 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 shadow-none hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                      </svg>
                      新对话
                    </Button>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto py-1.5">
                    {visibleSessions.length === 0 ? (
                      <p className="px-3 py-8 text-center text-xs text-slate-400">暂无对话</p>
                    ) : (
                      visibleSessions.map((sess) => (
                        <div key={sess.id} className="group/session relative">
                          <Button
                            htmlType="button"
                            onClick={() => handleOpenSession(sess.id)}
                            className={`flex h-auto w-full flex-col items-start justify-start border-0 px-3 py-2.5 pr-10 text-left shadow-none transition-colors cursor-pointer ${
                              sess.id === activeSessionId ? 'bg-blue-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <p className={`w-full truncate text-left text-sm ${sess.id === activeSessionId ? 'font-medium text-blue-700' : 'text-slate-700'}`}>
                              {sess.title}
                            </p>
                            <p className="mt-0.5 w-full text-left text-xs text-slate-400">{formatTime(sess.createdAt)}</p>
                          </Button>

                          <Button
                            htmlType="button"
                            onClick={(e) => handleDelete(e, sess.id)}
                            disabled={deletingId === sess.id}
                            title="删除对话"
                            className="absolute right-2 top-1/2 h-auto -translate-y-1/2 rounded-lg border-0 p-1 text-slate-300 opacity-0 shadow-none transition-colors hover:bg-red-50 hover:text-red-500 group-hover/session:opacity-100 disabled:opacity-40"
                          >
                            {deletingId === sess.id ? (
                              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            )}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <SidebarIconButton label="任务" active={isTasks} onClick={() => navigate('tasks')}>
              {taskIcon}
            </SidebarIconButton>
            {isAdmin && (
              <SidebarIconButton label="知识库" active={isKb} onClick={() => navigate('kb')}>
                {kbIcon}
              </SidebarIconButton>
            )}
            <SidebarIconButton label="经营分析" active={isAnalytics} onClick={() => navigate('analytics')}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M9 17V9m4 8V5m4 12v-6" />
              </svg>
            </SidebarIconButton>
          </div>

          <div className="p-2 border-t border-slate-200 flex justify-center">
            <Button
              htmlType="button"
              onClick={toggleSidebarCollapsed}
              aria-label="展开用户菜单"
              className="group relative h-10 min-w-10 w-10 rounded-full bg-blue-50 p-0 text-blue-700 border border-blue-100 flex items-center justify-center text-xs font-bold hover:bg-blue-100 transition-colors cursor-pointer"
            >
              {initial}
              <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                展开用户菜单
              </span>
            </Button>
          </div>
        </>
      ) : (
        <>
      <div className="p-3 border-b border-slate-200">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="flex-1 text-sm font-semibold text-slate-800 tracking-tight">对账 Agent</span>
          <Button
            htmlType="button"
            onClick={toggleSidebarCollapsed}
            title="折叠侧边栏"
            aria-label="折叠侧边栏"
            className="h-10 min-w-10 w-10 flex shrink-0 items-center justify-center rounded-lg border-0 p-0 text-slate-400 shadow-none hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            icon={
              <svg className="h-5 w-5 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v16M16 9l-3 3 3 3" />
              </svg>
            }
          />
        </div>

        <div className="mb-3 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">功能入口</span>
          </div>
          <div className="mt-2 rounded-2xl bg-slate-100 p-1">
            <div className="flex flex-col gap-1">
              <Button
                onClick={() => navigate('chat')}
                className={`group flex h-11 w-full box-border items-center gap-2.5 rounded-xl border-0 px-3 py-2 text-left text-xs font-medium leading-none shadow-none transition-colors cursor-pointer ${
                  isChat ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isChat ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-400 group-hover:text-blue-700'
                }`}>
                  {chatIcon}
                </span>
                <span>对话</span>
              </Button>
              <Button
                onClick={() => navigate('tasks')}
                className={`group flex h-11 w-full box-border items-center gap-2.5 rounded-xl border-0 px-3 py-2 text-left text-xs font-medium leading-none shadow-none transition-colors cursor-pointer ${
                  isTasks ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isTasks ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-400 group-hover:text-blue-700'
                }`}>
                  {taskIcon}
                </span>
                <span>任务</span>
              </Button>
              {isAdmin && (
                <Button
                  onClick={() => navigate('kb')}
                  className={`group flex h-11 w-full box-border items-center gap-2.5 rounded-xl border-0 px-3 py-2 text-left text-xs font-medium leading-none shadow-none transition-colors cursor-pointer ${
                    isKb ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                  }`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isKb ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-400 group-hover:text-blue-700'
                  }`}>
                    {kbIcon}
                  </span>
                  <span>知识库</span>
                </Button>
              )}
              <Button
                onClick={() => navigate('analytics')}
                className={`group flex h-11 w-full box-border items-center gap-2.5 rounded-xl border-0 px-3 py-2 text-left text-xs font-medium leading-none shadow-none transition-colors cursor-pointer ${
                  isAnalytics ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isAnalytics ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-400 group-hover:text-blue-700'
                }`}>
                  {analyticsIcon}
                </span>
                <span>经营分析</span>
              </Button>
            </div>
          </div>
        </div>

        {isChat && (
          <Button
            htmlType="button"
            onClick={handleNewChat}
            className="h-auto w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 text-sm font-medium shadow-sm transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            新对话
          </Button>
        )}
      </div>

      {isChat && (
        <div className="flex-1 overflow-y-auto border-t border-slate-100 py-2">
          <div className="mb-1 flex items-center justify-between px-3 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">历史记录</span>
            <span className="text-[10px] text-slate-300">{visibleSessions.length}</span>
          </div>
          {visibleSessions.length === 0 && (
            <p className="text-slate-400 text-xs text-center mt-8">暂无对话</p>
          )}
          {visibleSessions.map((sess) => (
            <div
              key={sess.id}
              className="relative"
              onMouseEnter={() => setHoveredId(sess.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <Button
                onClick={() => setActiveSession(sess.id)}
                className={`flex h-auto w-full flex-col items-start justify-start border-0 px-3 py-2.5 pr-8 text-left shadow-none transition-colors cursor-pointer ${
                  sess.id === activeSessionId
                    ? 'bg-blue-50 border-l-2 border-blue-500'
                    : 'hover:bg-slate-50 border-l-2 border-transparent'
                }`}
              >
                <p className={`w-full truncate text-left text-sm ${sess.id === activeSessionId ? 'text-blue-700 font-medium' : 'text-slate-700'} `}>
                  {sess.title}
                </p>
                <p className="mt-0.5 w-full text-left text-xs text-slate-400">{formatTime(sess.createdAt)}</p>
              </Button>

              {hoveredId === sess.id && (
	                <Button
	                  onClick={(e) => handleDelete(e, sess.id)}
	                  disabled={deletingId === sess.id}
	                  title="删除对话"
	                  className="absolute right-2 top-1/2 h-auto -translate-y-1/2 rounded-md border-0 p-1 text-slate-400 shadow-none hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40"
	                >
                  {deletingId === sess.id ? (
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
	                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {isTasks && <TaskListPanel />}

      {isAnalytics && <div className="flex-1" />}

      {route === 'kb' && (
        <div className="flex-1 overflow-y-auto py-3 px-3 text-xs text-slate-500 leading-relaxed">
          <p className="font-medium text-slate-600 mb-1">知识库</p>
          <p>沉淀业务规则、SOP、对账口径等。</p>
          <p className="mt-2">仅管理员可写入与编辑；所有用户共享同一租户的知识。</p>
        </div>
      )}

{route.startsWith('admin') && (
        <div className="flex-1 overflow-y-auto py-3 px-3 text-xs text-slate-500 leading-relaxed">
          <p className="font-medium text-slate-600 mb-1">管理后台</p>
          <p>本租户概览、用户管理和连接器设置。</p>
        </div>
      )}

      {route.startsWith('profile') && (
        <div className="flex-1 overflow-y-auto py-3 px-3 text-xs text-slate-500 leading-relaxed">
          <p className="font-medium text-slate-600 mb-1">个人设置</p>
          <p>修改密码、个人信息等。</p>
        </div>
      )}

      <div className="p-3 border-t border-slate-200">
        <UserMenu />
      </div>
        </>
      )}
    </aside>
  );
}
