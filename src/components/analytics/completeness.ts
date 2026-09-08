import type { DataStatus } from '../../features/operations-analysis/types/contracts';

export type CompletenessLike = {
  status?: unknown;
  data_status?: unknown;
  complete?: unknown;
};

const CANONICAL_STATUSES = new Set<DataStatus>(['ready', 'partial', 'missing', 'stale']);

function isDataStatus(value: string): value is DataStatus {
  return CANONICAL_STATUSES.has(value as DataStatus);
}

export function normalizeDataStatus(value: unknown, fallback: DataStatus = 'missing'): DataStatus {
  const status = String(value || fallback).trim().toLowerCase();
  if (status === 'ok') return 'ready';
  if (status === 'incomplete') return 'partial';
  return isDataStatus(status) ? status : fallback;
}

export function completenessStatus(
  completeness?: CompletenessLike | null,
  payloadStatus?: unknown,
): DataStatus {
  return normalizeDataStatus(completeness?.status ?? completeness?.data_status ?? payloadStatus);
}

export function completenessIsReady(
  completeness: CompletenessLike | null | undefined,
  status: unknown,
): boolean {
  if (typeof completeness?.complete === 'boolean') return completeness.complete;
  return normalizeDataStatus(status) === 'ready';
}
