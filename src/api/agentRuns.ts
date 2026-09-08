import { apiFetch, apiStreamFetch } from './client';
import { readSseData } from './sse';
import type { AgentRunEventEnvelope, AgentRunStatus } from '../types/agentRun';

export interface AgentRunCommandResult {
  accepted: boolean;
  run_id: string;
  run_status: AgentRunStatus;
  task_status: string;
  event_cursor: number;
}

const AGENT_RUN_STATUSES = new Set<AgentRunStatus>([
  'queued', 'running', 'validating', 'waiting_for_data', 'waiting_for_approval',
  'needs_review', 'completed', 'failed', 'cancelled',
]);

function isCommandResult(value: unknown): value is AgentRunCommandResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return typeof result.accepted === 'boolean'
    && typeof result.run_id === 'string'
    && typeof result.run_status === 'string'
    && AGENT_RUN_STATUSES.has(result.run_status as AgentRunStatus)
    && typeof result.task_status === 'string'
    && Number.isInteger(result.event_cursor)
    && (result.event_cursor as number) >= 0;
}

async function commandAgentRun(
  endpoint: '/api/v1/agent-runs/resume' | '/api/v1/agent-runs/cancel',
  body: Record<string, unknown>,
  fallback: string,
): Promise<AgentRunCommandResult> {
  const response = await apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>).detail
      : null;
    throw new Error(typeof detail === 'string' ? detail : fallback);
  }
  if (!isCommandResult(data)) throw new Error(fallback);
  return data;
}

export function resumeAgentRun(
  runId: string,
  requestId: string,
  message: string,
): Promise<AgentRunCommandResult> {
  return commandAgentRun('/api/v1/agent-runs/resume', {
    run_id: runId,
    request_id: requestId,
    payload: { type: 'additional_data', additional_data: { message } },
  }, '研究任务恢复失败');
}

export function cancelAgentRun(
  runId: string,
  requestId: string,
): Promise<AgentRunCommandResult> {
  return commandAgentRun('/api/v1/agent-runs/cancel', {
    run_id: runId,
    request_id: requestId,
  }, '研究任务取消失败');
}

export class AgentRunStreamError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'AgentRunStreamError';
  }
}

export async function* streamAgentRunEvents(
  runId: string,
  afterSequence: number,
  signal: AbortSignal,
): AsyncGenerator<AgentRunEventEnvelope> {
  const stream = await apiStreamFetch('/api/v1/agent-runs/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id: runId, after_sequence: afterSequence }),
    signal,
  });

  try {
    if (!stream.response.ok) {
      throw new AgentRunStreamError(
        '研究任务事件流连接失败',
        stream.response.status >= 500,
      );
    }
    if (!stream.response.body) {
      throw new AgentRunStreamError('研究任务事件流缺少响应内容', false);
    }
    for await (const raw of readSseData(stream.response.body, stream.signal)) {
      if (raw.startsWith(':')) continue;
      let parsed: AgentRunEventEnvelope;
      try {
        parsed = JSON.parse(raw) as AgentRunEventEnvelope;
      } catch {
        throw new AgentRunStreamError('研究任务事件格式错误', false);
      }
      if (
      !parsed
      || parsed.run_id !== runId
      || !Number.isInteger(parsed.sequence)
      || parsed.sequence <= 0
      || typeof parsed.type !== 'string'
      || typeof parsed.created_at !== 'string'
      || parsed.created_at.length === 0
      || parsed.data === null
        || typeof parsed.data !== 'object'
        || Array.isArray(parsed.data)
      ) throw new AgentRunStreamError('研究任务事件格式错误', false);
      yield parsed;
    }
  } finally {
    stream.release();
  }
}
