import { apiFetch } from './client';
import type { ExtractedFact, KbEntry, KnowledgeReadiness, ReconcileTemplateDraft, ReconcileTemplateSummary, ReportTemplateDetail, ReportTemplateSummary, SalaryTemplateDraft, SalaryTemplateSummary, SeedImportResult } from '../types';

export async function listKbEntries(category?: string): Promise<KbEntry[]> {
  const url = category ? `/api/v1/kb/entries?category=${encodeURIComponent(category)}` : '/api/v1/kb/entries';
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('加载知识库失败');
  return res.json();
}

export async function getKnowledgeReadiness(context = 'all'): Promise<KnowledgeReadiness> {
  const res = await apiFetch(`/api/v1/kb/readiness?context=${encodeURIComponent(context)}`);
  if (!res.ok) throw new Error('加载知识库完整度失败');
  return res.json();
}

export async function createKbEntry(body: {
  title: string;
  content: string;
  category?: string;
  source?: string;
  source_session_id?: string;
}): Promise<KbEntry> {
  const res = await apiFetch('/api/v1/kb/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '新增失败');
  }
  return res.json();
}

export async function updateKbEntry(id: string, body: Partial<Pick<KbEntry, 'title' | 'content' | 'category'>>): Promise<KbEntry> {
  const res = await apiFetch(`/api/v1/kb/entries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '更新失败');
  }
  return res.json();
}

export async function deleteKbEntry(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/kb/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '删除失败');
  }
}

export async function listReconcileTemplates(): Promise<ReconcileTemplateSummary[]> {
  const res = await apiFetch('/api/v1/kb/reconcile/templates');
  if (!res.ok) throw new Error('加载对账模板失败');
  return res.json();
}

export async function saveReconcileTemplate(body: {
  provider: string;
  template: Record<string, unknown>;
  overwrite?: boolean;
}): Promise<ReconcileTemplateSummary> {
  const res = await apiFetch('/api/v1/kb/reconcile/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, overwrite: body.overwrite ?? true }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '保存模板失败');
  }
  return res.json();
}

export async function deleteReconcileTemplate(provider: string): Promise<void> {
  const res = await apiFetch(`/api/v1/kb/reconcile/templates/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '删除模板失败');
  }
}

export async function draftReconcileTemplateFromExcel(file: File, provider?: string, rules?: string): Promise<ReconcileTemplateDraft> {
  const form = new FormData();
  form.append('file', file);
  if (provider?.trim()) form.append('provider', provider.trim());
  if (rules?.trim()) form.append('rules', rules.trim());
  const res = await apiFetch('/api/v1/kb/reconcile/templates/draft-from-excel', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? 'Excel 转模板失败');
  }
  return res.json();
}

export async function importSeedReconcileTemplates(overwrite = false): Promise<SeedImportResult> {
  const res = await apiFetch(`/api/v1/kb/reconcile/templates/import-seeds?overwrite=${overwrite ? 'true' : 'false'}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '导入种子模板失败');
  }
  return res.json();
}

export async function listSalaryTemplates(): Promise<SalaryTemplateSummary[]> {
  const res = await apiFetch('/api/v1/kb/payroll/templates');
  if (!res.ok) throw new Error('加载工资表模板失败');
  return res.json();
}

export async function draftSalaryTemplateFromExcel(file: File, name?: string): Promise<SalaryTemplateDraft> {
  const form = new FormData();
  form.append('file', file);
  if (name?.trim()) form.append('name', name.trim());
  const res = await apiFetch('/api/v1/kb/payroll/templates/draft-from-excel', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '工资表转模板失败');
  }
  return res.json();
}

export async function saveSalaryTemplate(body: {
  name: string;
  template: Record<string, unknown>;
  overwrite?: boolean;
}): Promise<SalaryTemplateSummary> {
  const res = await apiFetch('/api/v1/kb/payroll/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, overwrite: body.overwrite ?? true }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '保存工资表模板失败');
  }
  return res.json();
}

export async function deleteSalaryTemplate(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/kb/payroll/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '删除工资表模板失败');
  }
}

export async function listReportTemplates(): Promise<ReportTemplateSummary[]> {
  const res = await apiFetch('/api/v1/kb/report-templates');
  if (!res.ok) throw new Error('加载财务报表模板失败');
  return res.json();
}

export async function uploadReportTemplate(file: File): Promise<ReportTemplateSummary> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch('/api/v1/kb/report-templates', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '上传财务报表模板失败');
  }
  return res.json();
}

export interface CarryforwardSeedResult {
  period: string;
  opening_items: number;
  unsettled_sheets: Record<string, number>;
}

export async function seedRevenueCollectionCarryforward(
  file: File,
  period: string,
): Promise<CarryforwardSeedResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('period', period);
  const res = await apiFetch('/api/v1/kb/report-templates/revenue-collection/carryforward-seed', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '上传上月回款表做期初失败');
  }
  return res.json();
}

export async function getReportTemplate(id: string): Promise<ReportTemplateDetail> {
  const res = await apiFetch(`/api/v1/kb/report-templates/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '加载财务报表模板详情失败');
  }
  return res.json();
}

export async function deleteReportTemplate(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/kb/report-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '删除财务报表模板失败');
  }
}

export async function uploadGlobalReportInstruction(file: File | null, text = ''): Promise<KbEntry> {
  const form = new FormData();
  if (file) form.append('file', file);
  form.append('text', text);
  const res = await apiFetch('/api/v1/kb/report-instructions', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '上传报表说明失败');
  }
  return res.json();
}

export async function uploadReportTemplateInstruction(templateId: string, file: File | null, text = ''): Promise<KbEntry> {
  const form = new FormData();
  if (file) form.append('file', file);
  form.append('text', text);
  const res = await apiFetch(`/api/v1/kb/report-templates/${encodeURIComponent(templateId)}/instructions`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '上传模板说明失败');
  }
  return res.json();
}

export async function updateGlobalReportInstruction(itemId: string, text: string): Promise<KbEntry> {
  const res = await apiFetch(`/api/v1/kb/report-instructions/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '更新报表说明失败');
  }
  return res.json();
}

export async function updateReportTemplateInstruction(templateId: string, itemId: string, text: string): Promise<KbEntry> {
  const res = await apiFetch(`/api/v1/kb/report-templates/${encodeURIComponent(templateId)}/instructions/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '更新模板说明失败');
  }
  return res.json();
}

export async function deleteGlobalReportInstruction(itemId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/kb/report-instructions/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '删除报表说明失败');
  }
}

export async function deleteReportTemplateInstruction(templateId: string, itemId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/kb/report-templates/${encodeURIComponent(templateId)}/instructions/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '删除模板说明失败');
  }
}

export async function uploadFinanceProcessDocx(file: File): Promise<KbEntry> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch('/api/v1/kb/finance/process-docx', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '上传流程知识失败');
  }
  return res.json();
}

export async function extractFromSession(sessionId: string): Promise<ExtractedFact[]> {
  const res = await apiFetch('/api/v1/kb/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? '抽取失败');
  }
  return res.json();
}
