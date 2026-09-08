import { useEffect, useState } from 'react';

import type { TaskRecord, TaskStage, TaskStatus } from '../types/task';

const ACTIVE_STATUSES = new Set<TaskStatus>(['pending', 'running', 'retrying']);
const STAGE_STATUSES = new Set<TaskStatus>(['pending', 'running', 'retrying', 'completed', 'failed']);

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStageStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && STAGE_STATUSES.has(value as TaskStatus);
}

export function parseTaskStage(meta: TaskRecord['meta']): TaskStage | null {
  const value = meta?.stage;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const { code, label, detail, status, current, total } = candidate;
  if (
    !nonEmptyString(code)
    || !nonEmptyString(label)
    || !nonEmptyString(detail)
    || !isStageStatus(status)
    || typeof current !== 'number'
    || !Number.isInteger(current)
    || current < 0
    || typeof total !== 'number'
    || !Number.isInteger(total)
    || total <= 0
    || current > total
  ) return null;

  const startedAt = typeof candidate.started_at === 'string' && Number.isFinite(Date.parse(candidate.started_at))
    ? candidate.started_at
    : undefined;
  return {
    code: code.trim(),
    label: label.trim(),
    detail: detail.trim(),
    status,
    current,
    total,
    ...(startedAt ? { started_at: startedAt } : {}),
  };
}

function formatElapsed(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${hours}小时 ${minutes}分 ${remainingSeconds}秒`
    : `${minutes}分 ${remainingSeconds}秒`;
}

export function useTaskStage(task: TaskRecord | null): { stage: TaskStage | null; elapsed: string | null } {
  const stage = task && ACTIVE_STATUSES.has(task.status) ? parseTaskStage(task.meta) : null;
  const startedAt = stage?.started_at;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return {
    stage,
    elapsed: startedAt ? `已耗时 ${formatElapsed(startedAt, now)}` : null,
  };
}
