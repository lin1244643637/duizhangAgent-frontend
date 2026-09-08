export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'validating'
  | 'waiting_for_data'
  | 'waiting_for_approval'
  | 'needs_review'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentRunEventEnvelope {
  run_id: string;
  sequence: number;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface AgentRunPublicEvent {
  sequence: number;
  type: string;
  stage?: string;
  label?: string;
  detail?: string;
  status?: AgentRunStatus;
  text?: string;
}

export interface AgentRunEventHandlers {
  onEvent: (event: AgentRunPublicEvent) => unknown;
  onCleanup?: () => void;
}
