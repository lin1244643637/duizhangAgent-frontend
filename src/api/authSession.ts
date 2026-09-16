import { apiUrl } from './url';
import type { AuthResponse } from './auth';

const REFRESH_THRESHOLD_MS = 6 * 60 * 60 * 1000;
let refreshPromise: Promise<AuthResponse | null> | null = null;

async function readAuthResponse(res: Response): Promise<AuthResponse> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '请求失败');
  }
  return res.json();
}

export async function refreshWebSession(): Promise<AuthResponse | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch(apiUrl('/api/v1/auth/refresh'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_type: 'web' }),
  })
    .then(async (res) => {
      if (res.status === 401) return null;
      return readAuthResponse(res);
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function logoutWebSession(): Promise<void> {
  try {
    await fetch(apiUrl('/api/v1/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_type: 'web' }),
    });
  } catch {
    // Local logout must still complete if the network request is unavailable.
  }
}

function jwtExpMs(token: string): number | null {
  const [, payload] = token.split('.');
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function shouldRefreshAccessToken(token: string | null): boolean {
  if (!token) return false;
  const expMs = jwtExpMs(token);
  if (expMs === null) return false;
  return expMs - Date.now() <= REFRESH_THRESHOLD_MS;
}
