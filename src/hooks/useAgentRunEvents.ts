import { useCallback, useEffect, useRef } from 'react';
import { AgentRunStreamError, streamAgentRunEvents } from '../api/agentRuns';
import type {
  AgentRunEventEnvelope,
  AgentRunEventHandlers,
  AgentRunPublicEvent,
  AgentRunStatus,
} from '../types/agentRun';

const TERMINAL_STATUSES = new Set<AgentRunStatus>(['completed', 'failed', 'cancelled']);
const PAUSED_STATUSES = new Set<AgentRunStatus>([
  'waiting_for_data',
  'waiting_for_approval',
  'needs_review',
]);
const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 10_000;

export function useAgentRunEvents() {
  const runsRef = useRef(new Map<string, {
    controller: AbortController;
    handlers: AgentRunEventHandlers;
  }>());

  const cleanupRun = useCallback((runId: string, controller?: AbortController) => {
    const active = runsRef.current.get(runId);
    if (!active || (controller && active.controller !== controller)) return;
    runsRef.current.delete(runId);
    active.controller.abort();
    active.handlers.onCleanup?.();
  }, []);

  const cancel = useCallback((runId?: string) => {
    if (runId) {
      cleanupRun(runId);
      return;
    }
    for (const runId of [...runsRef.current.keys()]) cleanupRun(runId);
  }, [cleanupRun]);

  const start = useCallback((runId: string, handlers: AgentRunEventHandlers, afterSequence = 0) => {
    cleanupRun(runId);
    const controller = new AbortController();
    runsRef.current.set(runId, { controller, handlers });

    void (async () => {
      let lastSequence = afterSequence;
      let reconnectMs = INITIAL_RECONNECT_MS;
      try {
        while (!controller.signal.aborted) {
          let received = false;
          try {
            for await (const envelope of streamAgentRunEvents(runId, lastSequence, controller.signal)) {
              if (controller.signal.aborted || envelope.sequence <= lastSequence) continue;
              let publicEvent: AgentRunPublicEvent;
              try {
                publicEvent = toPublicEvent(envelope);
                await handlers.onEvent(publicEvent);
              } catch {
                break;
              }
              lastSequence = envelope.sequence;
              received = true;
              if (isTerminal(publicEvent) || isPaused(publicEvent)) {
                cleanupRun(runId, controller);
                return;
              }
            }
          } catch (error) {
            if (controller.signal.aborted || (error as Error).name === 'AbortError') return;
            const retryable = error instanceof TypeError
              || (error instanceof AgentRunStreamError && error.retryable);
            if (!retryable) {
              cleanupRun(runId, controller);
              return;
            }
          }
          if (controller.signal.aborted) return;
          if (received) reconnectMs = INITIAL_RECONNECT_MS;
          await abortableDelay(reconnectMs, controller.signal);
          reconnectMs = Math.min(reconnectMs * 2, MAX_RECONNECT_MS);
        }
      } finally {
        cleanupRun(runId, controller);
      }
    })();
  }, [cleanupRun]);

  useEffect(() => cancel, [cancel]);

  return { start, cancel };
}

function toPublicEvent(envelope: AgentRunEventEnvelope): AgentRunPublicEvent {
  const data = envelope.data;
  const event: AgentRunPublicEvent = {
    sequence: envelope.sequence,
    type: envelope.type,
  };
  if (typeof data.stage === 'string') event.stage = data.stage;
  if (typeof data.label === 'string') event.label = data.label;
  if (typeof data.detail === 'string') event.detail = data.detail;
  if (
    (
      envelope.type === 'status'
      || envelope.type === 'final'
      || envelope.type === 'failed'
      || envelope.type === 'approval_request'
    )
    && isRunStatus(data.status)
  ) {
    event.status = data.status;
  }
  if (envelope.type === 'final') {
    if (typeof data.text === 'string') event.text = data.text;
    else if (typeof data.content === 'string') event.text = data.content;
  }
  return event;
}

function isRunStatus(value: unknown): value is AgentRunStatus {
  return typeof value === 'string' && [
    'queued', 'running', 'validating', 'waiting_for_data', 'waiting_for_approval',
    'needs_review', 'completed', 'failed', 'cancelled',
  ].includes(value);
}

function isTerminal(event: AgentRunPublicEvent): boolean {
  return event.type === 'final'
    || event.type === 'failed'
    || (
      event.type === 'status'
      && (
        (event.status !== undefined && TERMINAL_STATUSES.has(event.status))
        || (isRunStatus(event.stage) && TERMINAL_STATUSES.has(event.stage))
      )
    );
}

function isPaused(event: AgentRunPublicEvent): boolean {
  return (event.type === 'status' || event.type === 'approval_request')
    && (
      (event.status !== undefined && PAUSED_STATUSES.has(event.status))
      || (isRunStatus(event.stage) && PAUSED_STATUSES.has(event.stage))
    );
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    const abort = () => done();
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      resolve();
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}
