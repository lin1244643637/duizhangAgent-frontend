// @vitest-environment jsdom

import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { useAuthStore } from './authStore';
import { useChatStore } from './chatStore';
import { createResourceStore } from './createResourceStore';
import { useTaskStore } from './taskStore';
import { useUiStore } from './uiStore';

describe('logout lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    useAuthStore.setState({
      token: 'token-a',
      username: 'account-a',
      userId: 'user-a',
      role: 'admin',
      tenantId: 'tenant-a',
      isLoggedIn: true,
    });
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      loadingHistory: false,
      pendingApproval: null,
    });
    useTaskStore.setState({ tasks: [], loading: false, selectedTaskId: null });
    useUiStore.setState({ route: 'chat', reviewPeriod: '', showUserMenu: false });
  });

  it('keeps access token in memory and clears user id on logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: 'token-b',
      user_id: 'user-b',
      tenant_id: 'tenant-b',
      role: 'admin',
      refresh_token: null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    await useAuthStore.getState().login('account-b', 'password-b');

    expect(useAuthStore.getState()).toMatchObject({
      token: 'token-b',
      username: 'account-b',
      userId: 'user-b',
      tenantId: 'tenant-b',
      isLoggedIn: true,
    });
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_user_id')).toBe('user-b');

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().userId).toBe('');
    expect(localStorage.getItem('auth_user_id')).toBeNull();
  });

  it('clears account-scoped stores on logout', () => {
    localStorage.setItem('activeSessionId', 'session-a');
    useChatStore.setState({
      sessions: [{
        id: 'session-a',
        title: 'Account A',
        messages: [],
        createdAt: 1,
      }],
      activeSessionId: 'session-a',
      loadingHistory: true,
      pendingApproval: { action: 'delete', description: 'delete', turnId: 'turn-a' },
    });
    useTaskStore.setState({
      tasks: [{ task_id: 'task-a', status: 'running' } as never],
      loading: true,
      selectedTaskId: 'task-a',
    });
    useUiStore.setState({ route: 'analytics', reviewPeriod: '2026-07', showUserMenu: true });

    useAuthStore.getState().logout();

    expect(useChatStore.getState()).toMatchObject({
      sessions: [],
      activeSessionId: null,
      loadingHistory: false,
      pendingApproval: null,
    });
    expect(useTaskStore.getState()).toMatchObject({
      tasks: [],
      loading: false,
      selectedTaskId: null,
    });
    expect(useUiStore.getState()).toMatchObject({
      route: 'chat',
      reviewPeriod: '',
      showUserMenu: false,
    });
    expect(localStorage.getItem('activeSessionId')).toBeNull();
  });

  it('aborts an in-flight authenticated request on logout', async () => {
    let capturedSignal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/api/v1/slow') return Promise.resolve(new Response('{}'));
      capturedSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }));

    void apiFetch('/api/v1/slow').catch(() => undefined);
    await waitFor(() => expect(capturedSignal).toBeInstanceOf(AbortSignal));

    useAuthStore.getState().logout();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('keeps a rotated session when an old request later returns unauthorized', async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    })));

    const oldRequest = apiFetch('/api/v1/old-session');
    await Promise.resolve();

    useAuthStore.getState().refreshAuth({
      token: 'token-b',
      username: 'account-a',
      user_id: 'user-a',
      tenant_id: 'tenant-a',
      role: 'admin',
    });
    resolveRequest(new Response(null, { status: 401 }));

    await expect(oldRequest).rejects.toMatchObject({ name: 'AbortError' });
    expect(useAuthStore.getState()).toMatchObject({
      token: 'token-b',
      isLoggedIn: true,
    });
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('does not restore a resource response that resolves after reset', async () => {
    let resolveRequest!: (items: Array<{ id: string }>) => void;
    const request = new Promise<Array<{ id: string }>>((resolve) => {
      resolveRequest = resolve;
    });
    const useResourceStore = createResourceStore(() => request);

    const load = useResourceStore.getState().load();
    useResourceStore.getState().reset();
    resolveRequest([{ id: 'account-a-item' }]);
    await load;

    expect(useResourceStore.getState()).toMatchObject({
      items: [],
      loaded: false,
      loading: false,
      error: '',
    });
  });
});
