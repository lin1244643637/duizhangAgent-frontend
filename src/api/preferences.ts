import { apiFetch } from './client';

/** 用户长期偏好：频次维度 {值:次数}、explicit 显性设置、display/style 展示风格。结构松散，按需读取。 */
export type UserPreferences = Record<string, unknown>;

export async function getMyPreferences(): Promise<UserPreferences> {
  const res = await apiFetch('/api/v1/auth/preferences');
  if (!res.ok) throw new Error('加载偏好失败');
  const data = await res.json();
  return (data?.preferences ?? {}) as UserPreferences;
}

export async function updateMyPreferences(explicit: Record<string, unknown>): Promise<UserPreferences> {
  const res = await apiFetch('/api/v1/auth/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ explicit }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '保存偏好失败');
  }
  const data = await res.json();
  return (data?.preferences ?? {}) as UserPreferences;
}

export async function clearMyPreferences(): Promise<boolean> {
  const res = await apiFetch('/api/v1/auth/preferences', { method: 'DELETE' });
  if (!res.ok) throw new Error('清除偏好失败');
  const data = await res.json().catch(() => ({}));
  return Boolean(data?.cleared);
}
