import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from './authStore';

const apiMocks = vi.hoisted(() => ({
  loginWithPassword: vi.fn(),
  loginWithCode: vi.fn(),
  registerAccount: vi.fn(),
  resetAccountPassword: vi.fn(),
}));
const authSessionMocks = vi.hoisted(() => ({
  refreshWebSession: vi.fn(),
  logoutWebSession: vi.fn(),
}));

vi.mock('../api/auth', () => apiMocks);
vi.mock('../api/authSession', () => authSessionMocks);

describe('authStore new authentication actions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    authSessionMocks.refreshWebSession.mockResolvedValue(null);
    authSessionMocks.logoutWebSession.mockResolvedValue(undefined);
    useAuthStore.setState({
      token: null,
      username: '',
      userId: '',
      role: 'member',
      tenantId: '',
      isLoggedIn: false,
      hydrating: false,
    });
  });

  it('persists the canonical username returned by email login', async () => {
    apiMocks.loginWithPassword.mockResolvedValue({
      token: 'token-1', username: 'operator', user_id: 'user-1', tenant_id: 'tenant-1', role: 'member',
    });

    await useAuthStore.getState().loginWithPassword('email', 'ops@example.com', 'secret-password');

    expect(useAuthStore.getState().username).toBe('operator');
    expect(localStorage.getItem('auth_username')).toBe('operator');
  });

  it('does not persist the one-time verification token during code login', async () => {
    apiMocks.loginWithCode.mockResolvedValue({
      token: 'token-2', username: 'operator', user_id: 'user-1', tenant_id: 'tenant-1', role: 'member',
    });

    await useAuthStore.getState().loginWithCode('one-time-token');

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('verification_token')).toBeNull();
    expect(Object.values(localStorage)).not.toContain('one-time-token');
  });

  it('commits the rotated contact-update session to state without persisting the access token', () => {
    localStorage.setItem('auth_token', 'stale-token');
    useAuthStore.setState({
      token: 'stale-token',
      username: 'former-operator',
      userId: 'former-user',
      role: 'member',
      tenantId: 'former-tenant',
      isLoggedIn: true,
    });

    useAuthStore.getState().refreshAuth({
      token: 'rotated-token',
      username: 'contact-user',
      user_id: 'user-1',
      tenant_id: 'tenant-1',
      role: 'admin',
    });

    expect(useAuthStore.getState()).toMatchObject({
      token: 'rotated-token',
      username: 'contact-user',
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'admin',
      isLoggedIn: true,
    });
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('restores a web session from the refresh cookie', async () => {
    authSessionMocks.refreshWebSession.mockResolvedValue({
      token: 'access-new',
      username: 'operator',
      user_id: 'user-1',
      tenant_id: 'tenant-1',
      role: 'admin',
      refresh_token: null,
    });

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState()).toMatchObject({
      token: 'access-new',
      username: 'operator',
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'admin',
      isLoggedIn: true,
      hydrating: false,
    });
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});
