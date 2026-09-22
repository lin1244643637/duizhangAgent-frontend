export type ConversationMode = 'legacy' | 'agui';

// AG-UI is the default transport. Set the flag to "false" for an emergency rollback.
export const isAguiEnabled = () => import.meta.env.VITE_AGUI_CHAT_ENABLED !== 'false';

export interface AguiRunInput {
  threadId: string;
  runId: string;
  parentRunId: null;
  state: Record<string, never>;
  messages: Array<{ id: string; role: 'user'; content: string }>;
  tools: never[];
  context: never[];
  forwardedProps: Record<string, unknown>;
}

export interface AguiEvent extends Record<string, unknown> {
  type: string;
  eventId: string;
  sequence: number;
  runId: string;
  threadId: string;
}

export type AguiStatus = 'connecting' | 'running' | 'completed' | 'failed' | 'cancelled'
  | 'disconnected' | 'interrupted' | 'waiting_for_approval';

export interface AguiApproval {
  id: string;
  toolLabel: string;
  message: string;
  expiresAt: string;
}

export interface AguiMessageState {
  runId: string;
  status: AguiStatus;
  detail?: string;
  approval?: AguiApproval;
}

export const AGUI_STATUS_LABELS: Record<AguiStatus, string> = {
  connecting: '正在连接',
  running: '正在处理',
  completed: '本轮已结束',
  failed: '本轮失败',
  cancelled: '已停止',
  disconnected: '连接已断开，任务状态未确认',
  interrupted: '任务已暂停，等待后续处理',
  waiting_for_approval: '等待审批',
};

export function isAguiUnresolved(status: AguiStatus): boolean {
  return status !== 'completed' && status !== 'failed' && status !== 'cancelled';
}

export function aguiRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
