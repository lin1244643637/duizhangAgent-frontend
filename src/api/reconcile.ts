import { apiFetch } from './client';

export interface MappingAnalysis {
  period: string;
  rule_count: number;
  keyword_conflicts: Array<{ keyword: string; target_platforms: string[] }>;
  transaction_conflicts: Array<Record<string, unknown>>;
  unmapped_bank_rows: Array<Record<string, unknown>>;
  hit_counts: Record<string, number>;
}

export interface ReviewData {
  period: string;
  summary: Record<string, unknown>;
  daily: Array<Record<string, unknown>>;
  review_matches: Array<Record<string, unknown>>;
  unmatched_platform: Array<Record<string, unknown>>;
  unmatched_bank: Array<Record<string, unknown>>;
}

async function jsonOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail ?? fallback);
  return data as T;
}

export async function getMappingAnalysis(period: string): Promise<MappingAnalysis> {
  const res = await apiFetch(`/api/v1/reconcile/mapping-analysis/${encodeURIComponent(period)}`);
  return jsonOrError<MappingAnalysis>(res, '加载映射分析失败');
}

export async function getReviewData(period: string): Promise<ReviewData> {
  const res = await apiFetch(`/api/v1/reconcile/review/${encodeURIComponent(period)}`);
  return jsonOrError<ReviewData>(res, '加载复核数据失败');
}

export async function rerunReconcile(period: string): Promise<{ task_id: string; status: string }> {
  const res = await apiFetch(`/api/v1/reconcile/rerun/${encodeURIComponent(period)}`, { method: 'POST' });
  return jsonOrError<{ task_id: string; status: string }>(res, '重跑对账失败');
}

export async function reviewAction(
  matchId: string,
  action: 'confirm' | 'ignore' | 'tag',
  body: { reason?: string; note?: string },
): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/v1/reconcile/review/matches/${encodeURIComponent(matchId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return jsonOrError<Record<string, unknown>>(res, '保存复核操作失败');
}
