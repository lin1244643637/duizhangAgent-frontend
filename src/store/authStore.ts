import { create } from 'zustand';
import { logoutWebSession, refreshWebSession } from '../api/authSession';
import {
  clearSessionState,
  invalidateSessionRequests,
  registerSessionUnauthorizedHandler,
} from '../api/sessionLifecycle';
import { apiUrl } from '../api/url';
import {
  loginWithCode as requestCodeLogin,
  loginWithPassword as requestPasswordLogin,
  registerAccount,
  resetAccountPassword,
  type AuthResponse,
  type IdentifierType,
  type Role,
} from '../api/auth';

interface AuthState {
  token: string | null;
  username: string;
  userId: string;
  role: Role;
  tenantId: string;
  isLoggedIn: boolean;
  hydrating: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithPassword: (identifierType: IdentifierType, identifier: string, password: string) => Promise<void>;
  loginWithCode: (verificationToken: string) => Promise<void>;
  register: (username: string, password: string, inviteToken: string, verificationToken?: string) => Promise<void>;
  resetPassword: (verificationToken: string, newPassword: string) => Promise<void>;
  refreshAuth: (response: AuthResponse) => void;
  joinTenant: (tenantCode: string) => Promise<string>;
  restoreSession: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  logout: (options?: { remote?: boolean }) => Promise<void>;
}

const _storedRole = (localStorage.getItem('auth_role') as Role | null) ?? 'member';
const _storedUsername = localStorage.getItem('auth_username') ?? '';
const _storedUserId = localStorage.getItem('auth_user_id') ?? '';
const _storedTenantId = localStorage.getItem('auth_tenant_id') ?? '';
const _legacyToken = localStorage.getItem('auth_token');
let _authGeneration = 0;

function _persistAuth(role: Role, username: string, userId: string, tenantId: string) {
  localStorage.removeItem('auth_token');
  localStorage.setItem('auth_role', role);
  localStorage.setItem('auth_username', username);
  localStorage.setItem('auth_user_id', userId);
  localStorage.setItem('auth_tenant_id', tenantId);
}

function _clearPersistedAuth() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_role');
  localStorage.removeItem('auth_username');
  localStorage.removeItem('auth_user_id');
  localStorage.removeItem('auth_tenant_id');
}

function _loggedOutState(hydrating = false) {
  return {
    token: null,
    username: '',
    userId: '',
    role: 'member' as Role,
    tenantId: '',
    isLoggedIn: false,
    hydrating,
  };
}

function _commitAuth(
  set: (state: Partial<AuthState>) => void,
  response: AuthResponse,
  fallbackUsername = '',
) {
  const username = response.username || fallbackUsername;
  _persistAuth(response.role, username, response.user_id, response.tenant_id);
  set({
    token: response.token,
    username,
    userId: response.user_id,
    role: response.role,
    tenantId: response.tenant_id,
    isLoggedIn: true,
    hydrating: false,
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: _legacyToken,
  username: _storedUsername,
  userId: _storedUserId,
  role: _storedRole,
  tenantId: _storedTenantId,
  isLoggedIn: !!_legacyToken,
  hydrating: true,

  login: async (username, password) => {
    const generation = ++_authGeneration;
    const response = await requestPasswordLogin('username', username, password);
    if (generation !== _authGeneration) return;
    _commitAuth(set, response, username);
  },

  loginWithPassword: async (identifierType, identifier, password) => {
    const generation = ++_authGeneration;
    const response = await requestPasswordLogin(identifierType, identifier, password);
    if (generation !== _authGeneration) return;
    _commitAuth(set, response, identifierType === 'username' ? identifier : '');
  },

  loginWithCode: async (verificationToken) => {
    const generation = ++_authGeneration;
    const response = await requestCodeLogin(verificationToken);
    if (generation !== _authGeneration) return;
    _commitAuth(set, response);
  },

  register: async (username, password, inviteToken, verificationToken = '') => {
    const generation = ++_authGeneration;
    const response = await registerAccount(username, password, inviteToken, verificationToken);
    if (generation !== _authGeneration) return;
    _commitAuth(set, response, username);
  },

  resetPassword: async (verificationToken, newPassword) => {
    await resetAccountPassword(verificationToken, newPassword);
  },

  refreshAuth: (response) => {
    _authGeneration += 1;
    invalidateSessionRequests();
    _commitAuth(set, response);
  },

  joinTenant: async (tenantCode) => {
    const token = get().token;
    const res = await fetch(apiUrl('/api/v1/auth/join-tenant'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ tenant_code: tenantCode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? '加入租户失败');
    }
    // 申请制：不再即时切换租户，返回待审批提示文案。
    const data = await res.json();
    return (data.message as string) ?? '申请已提交，等待管理员审批';
  },

  restoreSession: async () => {
    const generation = ++_authGeneration;
    set({ hydrating: true });
    const refreshed = await refreshWebSession();
    if (generation !== _authGeneration) return;
    if (refreshed) {
      const username = refreshed.username ?? localStorage.getItem('auth_username') ?? get().username;
      _persistAuth(refreshed.role, username, refreshed.user_id, refreshed.tenant_id);
      set({
        token: refreshed.token,
        username,
        userId: refreshed.user_id,
        role: refreshed.role,
        tenantId: refreshed.tenant_id,
        isLoggedIn: true,
        hydrating: false,
      });
      return;
    }
    if (get().token) {
      set({ hydrating: false });
      return;
    }
    _clearPersistedAuth();
    set(_loggedOutState(false));
  },

  refreshSession: async () => {
    const generation = _authGeneration;
    const refreshed = await refreshWebSession();
    if (generation !== _authGeneration) return false;
    if (!refreshed) {
      _clearPersistedAuth();
      set(_loggedOutState(false));
      return false;
    }
    const username = refreshed.username ?? localStorage.getItem('auth_username') ?? get().username;
    _persistAuth(refreshed.role, username, refreshed.user_id, refreshed.tenant_id);
    set({
      token: refreshed.token,
      username,
      userId: refreshed.user_id,
      role: refreshed.role,
      tenantId: refreshed.tenant_id,
      isLoggedIn: true,
      hydrating: false,
    });
    return true;
  },

  logout: async (options) => {
    _authGeneration += 1;
    clearSessionState();
    _clearPersistedAuth();
    set(_loggedOutState(false));
    if (options?.remote === false) return;
    await logoutWebSession();
  },
}));

registerSessionUnauthorizedHandler((token) => {
  const state = useAuthStore.getState();
  if (state.token === token) void state.logout({ remote: false });
});
