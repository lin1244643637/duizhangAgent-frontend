/** 统一消息自动化 API 客户端（M1–M4）：消息通道 / 工作流 / 推送日志 / 对话入口。 */

import { apiFetch } from './client';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `请求失败（${res.status}）`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    const error = new Error(detail) as Error & { responseReceived: boolean; status: number };
    error.responseReceived = true;
    error.status = res.status;
    throw error;
  }
  return res.json() as Promise<T>;
}

function asArray<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const value = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(value) ? value as T[] : [];
}

// ── 消息通道 ────────────────────────────────────────────────────────────

export type NotificationChannel = {
  id: string;
  provider: string;
  channel_type: string;
  supported?: boolean;
  name: string;
  enabled: boolean;
  config_summary: Record<string, unknown>;
  last_test_status: string | null;
  last_test_message: string | null;
  last_test_at: string | null;
};

export type AutomationRecipientEmployee = {
  ding_user_id: string;
  name: string;
  position: string | null;
  department_names: string[];
};

export async function listChannels(): Promise<NotificationChannel[]> {
  const data = await json<unknown>(await apiFetch('/api/v1/notifications/channels'));
  return asArray<NotificationChannel>(data, 'channels');
}

export async function createChannel(body: {
  provider: string;
  channel_type: string;
  name: string;
  config: Record<string, unknown>;
  enabled?: boolean;
}): Promise<NotificationChannel> {
  return json(await apiFetch('/api/v1/notifications/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function updateChannel(id: string, body: Record<string, unknown>): Promise<NotificationChannel> {
  return json(await apiFetch(`/api/v1/notifications/channels/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function deleteChannel(id: string): Promise<void> {
  await json(await apiFetch(`/api/v1/notifications/channels/${id}`, { method: 'DELETE' }));
}

export async function testChannel(id: string, body: { user_ids: string[]; content?: string; title?: string; msg_type?: string }): Promise<{ status: string; result: unknown }> {
  return json(await apiFetch(`/api/v1/notifications/channels/${id}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function listRecipientEmployees(): Promise<AutomationRecipientEmployee[]> {
  const data = await json<unknown>(await apiFetch('/api/v1/automations/recipient-employees'));
  return asArray<AutomationRecipientEmployee>(data, 'employees');
}

// ── 自动化工作流 ────────────────────────────────────────────────────────

export type AutomationRun = {
  id: string;
  workflow_id: string;
  scheduled_for?: string | null;
  idempotency_key?: string | null;
  run_date: string;
  status: string;
  total_count: number;
  success_count: number;
  failed_count: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  workflow_name?: string | null;   // 推送日志：工作流名（兜底标题）
  title?: string | null;           // 推送日志：本次推送的实际标题
  recipient_names?: string[];      // 推送日志：接收员工名
};

export type AutomationWorkflow = {
  id: string;
  name: string;
  workflow_type: string;
  trigger_type: string;
  cron_expr: string | null;
  timezone: string;
  date_window_type: string;
  enabled: boolean;
  channel_id: string | null;
  recipient_config: Record<string, unknown> | null;
  rule_config: Record<string, unknown> | null;
  message_template: Record<string, unknown> | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run: AutomationRun | null;
};

export async function listWorkflows(): Promise<AutomationWorkflow[]> {
  const data = await json<unknown>(await apiFetch('/api/v1/automations/workflows'));
  return asArray<AutomationWorkflow>(data, 'workflows');
}

export async function createWorkflow(body: Record<string, unknown>): Promise<AutomationWorkflow> {
  return json(await apiFetch('/api/v1/automations/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function draftAutomationRule(text: string): Promise<{ rule_config: Record<string, unknown>; source: string; warnings: string[] }> {
  return json(await apiFetch('/api/v1/automations/rule-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }));
}

export async function testWorkflowDraft(body: Record<string, unknown>): Promise<{ status: string; run: AutomationRun }> {
  return json(await apiFetch('/api/v1/automations/workflows/test-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function updateWorkflow(id: string, body: Record<string, unknown>): Promise<AutomationWorkflow> {
  return json(await apiFetch(`/api/v1/automations/workflows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function deleteWorkflow(id: string): Promise<void> {
  await json(await apiFetch(`/api/v1/automations/workflows/${id}`, { method: 'DELETE' }));
}

function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export async function runWorkflowNow(
  id: string,
  idempotencyKey = newIdempotencyKey(),
): Promise<{ status: string; run: AutomationRun; idempotency_key: string }> {
  return json(await apiFetch(`/api/v1/automations/workflows/${id}/run-now`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
  }));
}

export async function listRuns(workflowId?: string): Promise<AutomationRun[]> {
  const qs = workflowId ? `?workflow_id=${encodeURIComponent(workflowId)}` : '';
  const data = await json<unknown>(await apiFetch(`/api/v1/automations/runs${qs}`));
  return asArray<AutomationRun>(data, 'runs');
}

export type Delivery = {
  id: string;
  recipient_type: string;
  external_user_id: string;
  recipient_name: string | null;
  status: string;
  error_message: string | null;
  provider_response?: Record<string, unknown> | null;
  sent_at: string | null;
};

export async function listRunDeliveries(runId: string): Promise<{ run: AutomationRun; deliveries: Delivery[] }> {
  return json(await apiFetch(`/api/v1/automations/runs/${runId}/deliveries`));
}

// ── 钉钉对话入口 ────────────────────────────────────────────────────────

export type ExternalBinding = {
  id: string;
  provider: string;
  external_user_id: string;
  internal_user_id: string;
  display_name: string | null;
  role_scope: Record<string, unknown> | null;
  enabled: boolean;
  bound_at: string | null;
};

export async function listBindings(): Promise<ExternalBinding[]> {
  const data = await json<unknown>(await apiFetch('/api/v1/external-chat/bindings'));
  return asArray<ExternalBinding>(data, 'bindings');
}

export async function createBinding(body: {
  provider: string;
  external_user_id: string;
  internal_user_id: string;
  display_name?: string;
  role_scope?: Record<string, unknown> | null;
}): Promise<ExternalBinding> {
  return json(await apiFetch('/api/v1/external-chat/bindings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function updateBinding(id: string, body: Record<string, unknown>): Promise<ExternalBinding> {
  return json(await apiFetch(`/api/v1/external-chat/bindings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function deleteBinding(id: string): Promise<void> {
  await json(await apiFetch(`/api/v1/external-chat/bindings/${id}`, { method: 'DELETE' }));
}

export type ExternalMessage = {
  id: string;
  provider: string;
  external_user_id: string;
  direction: string;
  content: string | null;
  intent_category: string | null;
  status: string | null;
  created_at: string | null;
};

export async function listExternalMessages(): Promise<ExternalMessage[]> {
  const data = await json<unknown>(await apiFetch('/api/v1/external-chat/messages'));
  return asArray<ExternalMessage>(data, 'messages');
}
