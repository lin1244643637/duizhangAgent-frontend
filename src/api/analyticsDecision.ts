import { apiFetch } from './client';
import type { EnterpriseProfile, EnterpriseProfileInput, ProfitLine, ProfitLineInput, ProfitLineVersions, StaffingRule, StaffingRuleInput, StaffingRuleVersions } from '../types/analyticsDecision';

export class AnalyticsDecisionApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `请求失败（${response.status}）`;
    try {
      detail = (await response.json()).detail || detail;
    } catch {
      // Keep the response status when the body is unavailable.
    }
    throw new AnalyticsDecisionApiError(detail, response.status);
  }
  return response.json() as Promise<T>;
}

export async function getProfitLineVersions(storeKey: string): Promise<ProfitLineVersions> {
  return json(await apiFetch(`/api/v1/analytics/decision/profit-lines/versions?store_key=${encodeURIComponent(storeKey)}`));
}

export async function saveProfitLine(body: ProfitLineInput): Promise<ProfitLine> {
  return json(await apiFetch('/api/v1/analytics/decision/profit-lines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function getStaffingRuleVersions(storeKey: string): Promise<StaffingRuleVersions> {
  return json(await apiFetch(`/api/v1/analytics/decision/staffing-rules/versions?store_key=${encodeURIComponent(storeKey)}`));
}

export async function saveStaffingRule(body: StaffingRuleInput): Promise<StaffingRule> {
  return json(await apiFetch('/api/v1/analytics/decision/staffing-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function getEnterpriseProfile(): Promise<EnterpriseProfile | null> {
  try {
    return await json(await apiFetch('/api/v1/analytics/decision/enterprise-profile'));
  } catch (error) {
    if (error instanceof AnalyticsDecisionApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getEnterpriseProfileHistory(): Promise<EnterpriseProfile[]> {
  return json(await apiFetch('/api/v1/analytics/decision/enterprise-profile/history?limit=100'));
}

export async function saveEnterpriseProfile(body: EnterpriseProfileInput): Promise<EnterpriseProfile> {
  return json(await apiFetch('/api/v1/analytics/decision/enterprise-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}
