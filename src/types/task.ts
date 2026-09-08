import type { AgentRunStatus } from './agentRun';

export type TaskStatus = 'pending' | 'running' | 'retrying' | 'completed' | 'failed' | 'cancelled';

const AGENT_RUN_STATUSES = new Set<AgentRunStatus>([
  'queued', 'running', 'validating', 'waiting_for_data', 'waiting_for_approval',
  'needs_review', 'completed', 'failed', 'cancelled',
]);

export const TASK_RUN_STATUS_LABELS: Record<AgentRunStatus, string> = {
  queued: '研究任务排队中',
  running: '正在研究',
  validating: '正在校验结果',
  waiting_for_data: '等待补充资料',
  waiting_for_approval: '等待审批',
  needs_review: '待人工复核',
  completed: '研究完成',
  failed: '研究失败',
  cancelled: '研究已取消',
};

export interface TaskStage {
  code: string;
  label: string;
  detail: string;
  status: TaskStatus;
  current: number;
  total: number;
  started_at?: string;
}

export interface TaskRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  session_id: string;
  task_type: string;
  status: TaskStatus;
  task_id: string;
  celery_task_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export function taskRunStatus(task: TaskRecord): AgentRunStatus | TaskStatus {
  const runStatus = task.meta?.run_status;
  return typeof runStatus === 'string' && AGENT_RUN_STATUSES.has(runStatus as AgentRunStatus)
    ? runStatus as AgentRunStatus
    : task.status;
}
