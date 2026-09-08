import { create } from 'zustand';
import { registerSessionCleanup } from '../api/sessionLifecycle';

export type AppRoute =
  | 'chat'
  | 'tasks'
  | 'kb'
  | 'connectors'
  | 'analytics'
  | 'profile'
  | 'profile.settings'
  | 'admin'
  | 'admin-users'
  | 'admin-connectors'
  | 'admin-automation';

interface UiState {
  route: AppRoute;
  reviewPeriod: string;
  sidebarCollapsed: boolean;
  navigate: (route: AppRoute) => void;
  openReview: (period: string) => void;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  showUserMenu: boolean;
  toggleUserMenu: () => void;
  closeUserMenu: () => void;
  isAdminSection: () => boolean;
  isMainSection: () => boolean;
  reset: () => void;
}

const KNOWN_ROUTES: AppRoute[] = [
  'chat', 'tasks', 'kb', 'connectors', 'analytics',
  'profile', 'profile.settings',
  'admin', 'admin-users', 'admin-connectors', 'admin-automation',
];

// 路由持久化到 URL hash，刷新后停留在当前页面（如知识库），而非跳回对话。
function parseHash(): { route: AppRoute; reviewPeriod: string } {
  const raw = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#\/?/, '');
  if (!raw) return { route: 'chat', reviewPeriod: '' };
  const [token, ...rest] = raw.split('/');
  if (token === 'review') return { route: 'chat', reviewPeriod: rest[0] ? decodeURIComponent(rest[0]) : '' };
  const route = (KNOWN_ROUTES as string[]).includes(token) ? (token as AppRoute) : 'chat';
  return { route, reviewPeriod: '' };
}

function writeHash(route: AppRoute): void {
  if (typeof window === 'undefined') return;
  const next = `#/${route}`;
  if (window.location.hash !== next) {
    window.location.hash = next;
  }
}

const initial = parseHash();
const initialSidebarCollapsed =
  typeof window !== 'undefined' ? window.localStorage.getItem('sidebarCollapsed') === 'true' : false;

export const useUiStore = create<UiState>((set, get) => ({
  route: initial.route,
  reviewPeriod: initial.reviewPeriod,
  sidebarCollapsed: initialSidebarCollapsed,
  navigate: (route) => {
    writeHash(route);
    set({ route, showUserMenu: false });
  },
  openReview: (period) => {
    writeHash('chat');
    set({ route: 'chat', reviewPeriod: period, showUserMenu: false });
  },
  toggleSidebarCollapsed: () => {
    set((s) => {
      const next = !s.sidebarCollapsed;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('sidebarCollapsed', String(next));
      }
      return { sidebarCollapsed: next, showUserMenu: false };
    });
  },
  setSidebarCollapsed: (collapsed) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('sidebarCollapsed', String(collapsed));
    }
    set({ sidebarCollapsed: collapsed, showUserMenu: false });
  },
  showUserMenu: false,
  toggleUserMenu: () => set((s) => ({ showUserMenu: !s.showUserMenu })),
  closeUserMenu: () => set({ showUserMenu: false }),
  isAdminSection: () => get().route.startsWith('admin'),
  isMainSection: () => get().route === 'chat' || get().route === 'tasks' || get().route === 'kb' || get().route === 'connectors',
  reset: () => {
    writeHash('chat');
    set({ route: 'chat', reviewPeriod: '', showUserMenu: false });
  },
}));

registerSessionCleanup(() => useUiStore.getState().reset());

// 浏览器前进/后退或直接修改 URL 时，同步路由状态（不回写 hash，避免循环）。
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const { route, reviewPeriod } = parseHash();
    useUiStore.setState({ route, reviewPeriod });
  });
}
