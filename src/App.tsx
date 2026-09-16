import { useEffect, useState } from 'react';
import { useChatStore } from './store/chatStore';
import { useAuthStore } from './store/authStore';
import { useUiStore } from './store/uiStore';
import { useAgentChat } from './hooks/useAgentChat';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { ApprovalModal } from './components/ApprovalModal';
import { LoginPage } from './components/LoginPage';
import { KnowledgeBasePage } from './components/KnowledgeBasePage';
import { TasksPage } from './components/TasksPage';
import { ConnectorsPage } from './components/ConnectorsPage';
import { AnalyticsPage } from './components/AnalyticsPage';
import { AdminPage } from './components/admin/AdminPage';
import { ProfileSettings } from './components/ProfileSettings';
import { MobileLayout } from './components/mobile/MobileLayout';
import { AdminApp } from './admin/AdminApp';
import { isPlatformHash } from './admin/adminStore';

function usePlatformAdminGate(): boolean {
  // hash 以 #/platform/ 开头时切到平台后台命名空间。
  // 用 state + hashchange 监听，避免初次加载和路径切换状态不同步。
  const [isPlatform, setIsPlatform] = useState(isPlatformHash);
  useEffect(() => {
    const onChange = () => setIsPlatform(isPlatformHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return isPlatform;
}

export default function App() {
  useEffect(() => {
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const isPlatformAdmin = usePlatformAdminGate();
  if (isPlatformAdmin) return <AdminApp />;
  return <TenantApp />;
}

function TenantApp() {
  const { pendingApproval, setPendingApproval, fetchUserSessions, resetToNewSession } = useChatStore();
  const { approveAction } = useAgentChat();
  const {
    token,
    isLoggedIn,
    role,
    hydrating,
    workspaceType,
    activeWorkspaceId,
    restoreSession,
    loadWorkspaceState,
  } = useAuthStore();
  const { route, navigate } = useUiStore();

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (hydrating || !isLoggedIn) return;
    void loadWorkspaceState();
  }, [hydrating, isLoggedIn, token, loadWorkspaceState]);

  useEffect(() => {
    if (hydrating || !isLoggedIn) return;
    fetchUserSessions().then(() => {
      if (!useChatStore.getState().activeSessionId) {
        resetToNewSession();
      }
    });
  }, [activeWorkspaceId, hydrating, isLoggedIn, fetchUserSessions, resetToNewSession]);

  useEffect(() => {
    if (workspaceType === 'personal' && route !== 'chat' && !route.startsWith('profile')) {
      navigate('chat');
    }
  }, [navigate, route, workspaceType]);

  if (hydrating) {
    return <div className="h-dvh bg-slate-50" />;
  }

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  const isPersonal = workspaceType === 'personal';
  const isAdmin = !isPersonal && route.startsWith('admin');
  const isProfile = route.startsWith('profile');
  const page = isProfile ? (
    <ProfileSettings />
  ) : isPersonal ? (
    <ChatWindow />
  ) : isAdmin ? (
    <AdminPage />
  ) : route === 'tasks' ? (
    <TasksPage />
  ) : route === 'kb' && role === 'admin' ? (
    <KnowledgeBasePage />
  ) : route === 'connectors' ? (
    <ConnectorsPage />
  ) : route === 'analytics' ? (
    <AnalyticsPage />
  ) : (
    <ChatWindow />
  );

  return (
    <div className="flex h-dvh bg-slate-50 overflow-hidden">
      <Sidebar />
      <MobileLayout>{page}</MobileLayout>

      {pendingApproval && (
        <ApprovalModal
          request={pendingApproval}
          onApprove={approveAction}
          onCancel={() => setPendingApproval(null)}
        />
      )}
    </div>
  );
}
