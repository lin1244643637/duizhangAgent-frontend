import { apiFetch } from './client';

/** 对话沉淀的候选知识/纠错草稿（方案 P3）。与 kb_entries 隔离，确认后才写入知识库。 */
export interface KnowledgeCandidate {
  id: string;
  user_id: string;
  session_id: string | null;
  kind: string;
  source_text: string;
  suggested_category: string;
  suggested_title: string;
  structured_payload: Record<string, unknown>;
  confidence: number;
  status: string;
  reviewed_by: string | null;
  created_at: string;
}

export async function listKnowledgeCandidates(status = 'draft'): Promise<KnowledgeCandidate[]> {
  const res = await apiFetch(`/api/v1/kb/knowledge-candidates?status=${encodeURIComponent(status)}`);
  if (!res.ok) throw new Error('加载知识候选失败');
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.candidates)) return data.candidates;
  return [];
}

export async function confirmKnowledgeCandidate(id: string): Promise<{ status: string; kb_entry_id: string | null }> {
  const res = await apiFetch(`/api/v1/kb/knowledge-candidates/${encodeURIComponent(id)}/confirm`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '确认失败');
  }
  return res.json();
}

export async function rejectKnowledgeCandidate(id: string): Promise<{ status: string }> {
  const res = await apiFetch(`/api/v1/kb/knowledge-candidates/${encodeURIComponent(id)}/reject`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '拒绝失败');
  }
  return res.json();
}
