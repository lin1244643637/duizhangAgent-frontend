import { apiFetch } from './client';
import type { QueryEvidence, KnowledgeSuggestion, QueryExportInfo, KnowledgeContext } from '../types';

export type ConnectorProvider = {
  provider: string;
  name: string;
  enabled: boolean;
};

export type ConnectorEndpoint = {
  provider: string;
  endpoint_key: string;
  name: string;
  required_permissions: string[];
  permission_steps: string[];
  doc_url?: string | null;
  field_schema: {
    path: string;
    label: string;
    type?: string;
    dimension?: boolean;
    metric?: boolean;
    sensitive?: boolean;
    default?: boolean;
    aliases?: string[];
  }[];
  request_schema: ConnectorRequestSchema;
  selected_fields_hint: string[];
};

export type ConnectorRequestSchema = {
  adapter_action?: string;
  required_params?: string[];
  runtime_required_params?: string[];
  param_hints?: Record<string, string>;
  selectors?: ConnectorRecordSelectorSchema[];
};

export type ConnectorRecordSelectorSchema = {
  type: 'record_group';
  key: string;
  label: string;
  source_endpoint_key: string;
  required?: boolean;
  record_page_size?: number;
  option_fields?: {
    id?: string;
    type?: string;
    name?: string;
  };
  column_param?: string;
  column_id_fields?: string[];
  column_name_fields?: string[];
  column_label?: string;
  empty_selection?: 'all' | 'none';
  ready_hint?: string;
  missing_hint?: string;
};

export type ConnectorIntegration = {
  configured: boolean;
  enabled: boolean;
  provider?: string;
  corp_id?: string;
  agent_id?: string;
  client_id?: string;
  client_secret?: string;
  last_test_status?: string | null;
  last_test_message?: string | null;
};

export type ShihengOrderAuthConfig = {
  configured: boolean;
  openapi_configured: boolean;
  legacy_configured: boolean;
  auth_mode: '' | 'openapi' | 'legacy';
  app_id: string;
  has_app_secret: boolean;
  app_secret_hint: string;
  enabled: boolean;
  alert_user_ids?: string;
  last_test_status?: string | null;
  last_test_message?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  last_auth_failed_at?: string | null;
  updated_at?: string;
};

export type ShihengOrderCrawlRun = {
  id: string;
  source_type: string;
  run_kind: string;
  trigger_source: string;
  window_start: string;
  window_end: string;
  status: string;
  pages_scanned: number;
  list_count: number;
  inserted_count: number;
  updated_count: number;
  detail_success_count: number;
  detail_skipped_count: number;
  detail_failed_count: number;
  current_business_date?: string | null;
  current_page?: number | null;
  resumed_from_run_id?: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type ShihengOrderRuntime = {
  schedule: {
    incremental_interval_minutes: number;
    incremental_window_minutes: number;
    monthly_backfill_time: string;
    current_month_backfill_time?: string;
    previous_month_backfill_time?: string;
    timezone: string;
    dedupe_key: string;
    update_rule: string;
    built_in_schedules?: {
      key: string;
      name: string;
      cron_label: string;
      window_label: string;
      queue: string;
    }[];
  };
  runs: ShihengOrderCrawlRun[];
  runs_page?: {
    offset: number;
    limit: number;
    next_offset: number | null;
    has_more: boolean;
  };
};

export type ConnectorDataSource = {
  id: string;
  provider: string;
  endpoint_key: string;
  display_name: string;
  selected_fields: string[];
  request_params_template: Record<string, unknown>;
  field_mapping: Record<string, unknown>;
  field_aliases: Record<string, unknown>;
  display_columns: string[];
  filters: Record<string, unknown>;
  draft_confidence: number | null;
  sync_mode: string;
  storage_policy: Record<string, unknown>;
  last_permission_status: string | null;
  last_permission_message: string | null;
  last_permission_checked_at: string | null;
  enabled: boolean;
  created_at: string;
};

export type ConnectorDataSourceDraft = {
  provider: string;
  endpoint_key: string;
  endpoint_name: string;
  display_name: string;
  request_params_template: Record<string, unknown>;
  date_from?: string | null;
  date_to?: string | null;
  selected_fields: string[];
  field_mapping: Record<string, unknown>;
  field_aliases: Record<string, unknown>;
  display_columns: string[];
  filters: Record<string, unknown>;
  confidence: number;
  required_permissions: string[];
  reason: string;
  warnings: string[];
};

export type ConnectorSyncRun = {
  id: string;
  provider: string;
  data_source_id: string;
  status: string;
  date_from: string | null;
  date_to: string | null;
  total_count: number;
  success_count: number;
  failed_count: number;
  error_message: string | null;
  trigger_source: string;
  request_params_override?: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type ConnectorSyncRunsPage = {
  runs: ConnectorSyncRun[];
  page: {
    offset: number;
    limit: number;
    next_offset: number | null;
    has_more: boolean;
  };
};

export type ConnectorSyncSchedule = {
  id: string;
  data_source_id: string;
  name: string;
  enabled: boolean;
  cron_expr: string;
  timezone: string;
  date_window_type: string;
  sync_window_config?: ConnectorSyncWindowConfig;
  sync_window_label?: string;
  source_sync_run_id: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  failure_count: number;
  last_error: string | null;
};

export type ConnectorSyncWindowConfig = {
  mode?: 'default' | 'custom_datetime';
  start_day_offset?: number;
  start_time?: string;
  end_day_offset?: number;
  end_time?: string;
};

export type ConnectorRecordTable = {
  columns: { field: string; label: string }[];
  rows: Record<string, string | number | null>[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  message?: string;
};

export type ConnectorReferenceRuleCandidate = {
  fingerprint: string;
  rule: {
    provider: string;
    entity_type: string;
    source_endpoint_keys: string[];
    source_record_types: string[];
    id_keys: string[];
    name_keys: string[];
    field_markers: string[];
    priority: number;
  };
  sample_count: number;
  samples: { id: string; name: string }[];
};

async function jsonOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail ?? fallback);
  return data as T;
}

function asArray<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const value = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(value) ? value as T[] : [];
}

export async function listConnectorProviders(): Promise<ConnectorProvider[]> {
  const data = await jsonOrError<unknown>(await apiFetch('/api/v1/connectors/providers'), '加载连接器列表失败');
  return asArray<ConnectorProvider>(data, 'providers');
}

export async function listConnectorEndpoints(provider: string): Promise<ConnectorEndpoint[]> {
  const data = await jsonOrError<unknown>(await apiFetch(`/api/v1/connectors/${encodeURIComponent(provider)}/endpoints`), '加载接口目录失败');
  return asArray<ConnectorEndpoint>(data, 'endpoints');
}

export async function getConnectorIntegration(provider: string): Promise<ConnectorIntegration> {
  return jsonOrError(await apiFetch(`/api/v1/connectors/${encodeURIComponent(provider)}/integration`), '加载连接配置失败');
}

export async function testConnectorIntegration(provider: string): Promise<{ ok: boolean; message: string }> {
  return jsonOrError(await apiFetch(`/api/v1/connectors/${encodeURIComponent(provider)}/test`, { method: 'POST' }), '测试连接失败');
}

export async function saveConnectorIntegration(
  provider: string,
  body: { corp_id: string; agent_id: string; client_id: string; client_secret: string; enabled: boolean },
): Promise<ConnectorIntegration> {
  return jsonOrError(
    await apiFetch(`/api/v1/connectors/${encodeURIComponent(provider)}/integration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    '保存连接配置失败',
  );
}

export async function getShihengOrderAuth(): Promise<ShihengOrderAuthConfig> {
  return jsonOrError(await apiFetch('/api/v1/connectors/shiheng-order/auth'), '加载食亨订单授权失败');
}

export async function getShihengOrderRuntime(offset = 0, limit = 20): Promise<ShihengOrderRuntime> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  return jsonOrError(await apiFetch(`/api/v1/connectors/shiheng-order/runtime?${params}`), '加载食亨订单任务状态失败');
}

export async function saveShihengOrderAuth(body: {
  app_id: string;
  app_secret: string;
  alert_user_ids: string;
  enabled: boolean;
}): Promise<ShihengOrderAuthConfig> {
  return jsonOrError(await apiFetch('/api/v1/connectors/shiheng-order/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), '保存食亨订单授权失败');
}

export async function testShihengOrderAuth(): Promise<{ ok: boolean; message: string; shop_count: number; accessible_shop_count: number }> {
  return jsonOrError(await apiFetch('/api/v1/connectors/shiheng-order/auth/test', { method: 'POST' }), '测试食亨订单授权失败');
}

export async function listConnectorDataSources(): Promise<ConnectorDataSource[]> {
  const data = await jsonOrError<unknown>(await apiFetch('/api/v1/connectors/data-sources'), '加载数据源失败');
  return asArray<ConnectorDataSource>(data, 'data_sources');
}

export async function draftConnectorDataSource(provider: string, text: string): Promise<ConnectorDataSourceDraft> {
  const body = JSON.stringify({ provider, text });
  const res = await apiFetch('/api/v1/connectors/data-source-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (res.status !== 404 && res.status !== 405) {
    return jsonOrError(res, '生成数据源配置失败');
  }
  return jsonOrError(await apiFetch('/api/v1/connectors/data-sources/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }), '生成数据源配置失败');
}

export async function saveConnectorDataSource(body: {
  id?: string;
  provider: string;
  endpoint_key: string;
  display_name: string;
  selected_fields: string[];
  request_params_template: Record<string, unknown>;
  field_mapping: Record<string, unknown>;
  field_aliases?: Record<string, unknown>;
  display_columns?: string[];
  filters?: Record<string, unknown>;
  draft_confidence?: number | null;
  enabled: boolean;
}): Promise<ConnectorDataSource> {
  const url = body.id ? `/api/v1/connectors/data-sources/${encodeURIComponent(body.id)}` : '/api/v1/connectors/data-sources';
  return jsonOrError(await apiFetch(url, {
    method: body.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: body.provider,
      endpoint_key: body.endpoint_key,
      display_name: body.display_name,
      selected_fields: body.selected_fields,
      request_params_template: body.request_params_template,
      field_mapping: body.field_mapping,
      field_aliases: body.field_aliases || {},
      display_columns: body.display_columns || body.selected_fields,
      filters: body.filters || {},
      draft_confidence: body.draft_confidence ?? null,
      sync_mode: 'manual',
      storage_policy: { raw_retention_months: 24, structured_retention_months: 36 },
      enabled: body.enabled,
    }),
  }), '保存数据源失败');
}

export async function deleteConnectorDataSource(id: string): Promise<void> {
  await jsonOrError(await apiFetch(`/api/v1/connectors/data-sources/${encodeURIComponent(id)}`, { method: 'DELETE' }), '删除数据源失败');
}

export async function testConnectorDataSourcePermission(id: string): Promise<{ status: string; message: string; required_permissions: string[] }> {
  return jsonOrError(await apiFetch(`/api/v1/connectors/data-sources/${encodeURIComponent(id)}/test-permission`, { method: 'POST' }), '测试接口权限失败');
}

export async function syncConnectorDataSource(id: string, dateFrom?: string, dateTo?: string): Promise<{ task_id: string; sync_run_id: string; status: string }> {
  return jsonOrError(await apiFetch(`/api/v1/connectors/data-sources/${encodeURIComponent(id)}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date_from: dateFrom || null, date_to: dateTo || null }),
  }), '启动同步失败');
}

export type ConnectorDatasetCard = {
  purpose?: string;
  purpose_source?: string;
  columns?: { key: string; example?: string }[];
};

export async function getConnectorDatasetCard(id: string): Promise<ConnectorDatasetCard> {
  return jsonOrError(await apiFetch(`/api/v1/connectors/data-sources/${encodeURIComponent(id)}/dataset-card`), '加载数据用途失败');
}

export async function updateConnectorDatasetPurpose(id: string, purpose: string): Promise<ConnectorDatasetCard> {
  return jsonOrError(await apiFetch(`/api/v1/connectors/data-sources/${encodeURIComponent(id)}/dataset-purpose`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose }),
  }), '保存数据用途失败');
}

export async function listConnectorSyncRuns(offset = 0, limit = 20): Promise<ConnectorSyncRunsPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const data = await jsonOrError<Partial<ConnectorSyncRunsPage> & { items?: ConnectorSyncRun[] }>(
    await apiFetch(`/api/v1/connectors/sync-runs?${params}`),
    '加载同步记录失败',
  );
  const runs = Array.isArray(data.runs) ? data.runs : Array.isArray(data.items) ? data.items : [];
  return {
    runs,
    page: {
      offset,
      limit,
      next_offset: null,
      has_more: false,
      ...data.page,
    },
  };
}

export async function getConnectorSyncRunRecords(runId: string, page = 1, pageSize = 20): Promise<ConnectorRecordTable> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  return jsonOrError(await apiFetch(`/api/v1/connectors/sync-runs/${encodeURIComponent(runId)}/records?${params}`), '加载同步结果失败');
}

export async function listConnectorReferenceRuleCandidates(runId: string): Promise<ConnectorReferenceRuleCandidate[]> {
  const data = await jsonOrError<{ candidates: ConnectorReferenceRuleCandidate[] }>(
    await apiFetch(`/api/v1/connectors/sync-runs/${encodeURIComponent(runId)}/reference-rule-candidates`),
    '加载引用规则候选失败',
  );
  return data.candidates;
}

export async function saveConnectorReferenceRule(candidate: ConnectorReferenceRuleCandidate): Promise<{ id: string; title: string; category: string }> {
  return jsonOrError(await apiFetch('/api/v1/connectors/reference-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...candidate.rule, samples: candidate.samples }),
  }), '保存引用规则失败');
}

export async function deleteConnectorSyncRun(id: string): Promise<void> {
  await jsonOrError(await apiFetch(`/api/v1/connectors/sync-runs/${encodeURIComponent(id)}`, { method: 'DELETE' }), '删除同步记录失败');
}

export async function listConnectorSchedules(): Promise<ConnectorSyncSchedule[]> {
  const data = await jsonOrError<unknown>(await apiFetch('/api/v1/connectors/schedules'), '加载自动同步计划失败');
  return asArray<ConnectorSyncSchedule>(data, 'schedules');
}

export async function saveConnectorSchedule(body: {
  id?: string;
  data_source_id: string;
  name: string;
  enabled: boolean;
  cron_expr: string;
  timezone: string;
  date_window_type: string;
  sync_window_config?: ConnectorSyncWindowConfig;
  source_sync_run_id: string;
}): Promise<ConnectorSyncSchedule> {
  const url = body.id ? `/api/v1/connectors/schedules/${encodeURIComponent(body.id)}` : '/api/v1/connectors/schedules';
  return jsonOrError(await apiFetch(url, {
    method: body.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), '保存自动同步计划失败');
}

export async function deleteConnectorSchedule(id: string): Promise<void> {
  await jsonOrError(await apiFetch(`/api/v1/connectors/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }), '删除自动同步计划失败');
}

export async function runConnectorScheduleNow(id: string): Promise<{ task_id: string; sync_run_id: string; status: string }> {
  return jsonOrError(await apiFetch(`/api/v1/connectors/schedules/${encodeURIComponent(id)}/run-now`, { method: 'POST' }), '启动自动同步失败');
}

export type QueryEvidenceResponse = {
  evidence: QueryEvidence | null;
  knowledge_suggestion: KnowledgeSuggestion | null;
  export: QueryExportInfo | null;
  knowledge_context?: KnowledgeContext | null;
};

/** 取本会话最近一次业务查询的「查询依据」+「待补知识建议」+「可导出」。 */
export async function getQueryEvidence(sessionId: string): Promise<QueryEvidenceResponse> {
  const params = new URLSearchParams({ session_id: sessionId });
  return jsonOrError(await apiFetch(`/api/v1/connectors/query-evidence?${params}`), '加载查询依据失败');
}

/** 下载本会话最近一次连接器表格查询的**全部行** Excel（聊天里被截断的也在内）。 */
export async function downloadQueryExport(sessionId: string): Promise<void> {
  const params = new URLSearchParams({ session_id: sessionId });
  const res = await apiFetch(`/api/v1/connectors/query-export?${params}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '导出失败');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1].replace(/"$/, '')) : '连接器查询导出.xlsx';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
