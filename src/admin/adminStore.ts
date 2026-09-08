/**
 * 平台后台独立 store。完全独立于租户 useAuthStore / useUiStore，
 * 避免任何状态/token 串台。
 */
import { create } from 'zustand';
import {
  clearPlatformToken,
  getPlatformToken,
  platformLogin,
  platformMe,
  setPlatformToken,
  type PlatformAdmin,
} from './adminApi';

export type AdminRoute = 'login' | 'dashboard' | 'users' | 'tenants' | 'task-logs' | 'usage' | 'billing';

const KNOWN_ROUTES: AdminRoute[] = ['login', 'dashboard', 'users', 'tenants', 'task-logs', 'usage', 'billing'];

function parsePlatformHash(): AdminRoute {
  const raw = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#\/?/, '');
  if (!raw.startsWith('platform/')) return 'login';
  const token = raw.slice('platform/'.length).split('/')[0];
  return (KNOWN_ROUTES as string[]).includes(token) ? (token as AdminRoute) : 'login';
}

function writePlatformHash(route: AdminRoute): void {
  if (typeof window === 'undefined') return;
  const next = `#/platform/${route}`;
  if (window.location.hash !== next) {
    window.location.hash = next;
  }
}

interface AdminState {
  token: string | null;
  admin: PlatformAdmin | null;
  isLoggedIn: boolean;
  route: AdminRoute;
  error: string;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  navigate: (route: AdminRoute) => void;
  hydrateFromHash: () => void;
  refreshMe: () => Promise<void>;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  token: getPlatformToken(),
  admin: null,
  isLoggedIn: !!getPlatformToken(),
  route: parsePlatformHash(),
  error: '',
  loading: false,

  login: async (username, password) => {
    set({ loading: true, error: '' });
    try {
      const { token, admin } = await platformLogin(username, password);
      setPlatformToken(token);
      set({ token, admin, isLoggedIn: true, loading: false });
      get().navigate('dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '登录失败';
      set({ error: message, loading: false });
    }
  },

  logout: () => {
    clearPlatformToken();
    set({ token: null, admin: null, isLoggedIn: false });
    get().navigate('login');
  },

  navigate: (route) => {
    writePlatformHash(route);
    set({ route });
  },

  hydrateFromHash: () => set({ route: parsePlatformHash() }),

  refreshMe: async () => {
    try {
      const admin = await platformMe();
      set({ admin });
    } catch {
      get().logout();
    }
  },
}));

// 监听 hash 变化，跨页面切换状态自动同步
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    useAdminStore.getState().hydrateFromHash();
  });
}

// 判断当前 hash 是不是平台后台命名空间（顶层 App 路由分流用）。
export function isPlatformHash(): boolean {
  if (typeof window === 'undefined') return false;
  return (window.location.hash || '').startsWith('#/platform/');
}
