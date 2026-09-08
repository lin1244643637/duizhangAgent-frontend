import { create } from 'zustand';
import { apiFetch } from '../api/client';
import { registerSessionCleanup } from '../api/sessionLifecycle';
import { taskRunStatus, type TaskRecord } from '../types/task';

type TaskLoadResult =
  | { status: 'success'; allTerminal: boolean }
  | { status: 'failed' | 'stale'; allTerminal: false };

export type TaskPollingScope =
  | { type: 'global' }
  | { type: 'session'; sessionId: string };

export const GLOBAL_TASK_POLL_SCOPE: TaskPollingScope = { type: 'global' };

interface TaskState {
  tasks: TaskRecord[];
  loading: boolean;
  selectedTaskId: string | null;

  loadTasks: (sessionId?: string, generation?: number) => Promise<TaskLoadResult>;
  deleteTask: (taskId: string) => Promise<void>;
  selectTask: (taskId: string | null) => void;
  startPolling: (ownerId: string, scope: TaskPollingScope) => void;
  stopPolling: (ownerId: string) => void;
  reset: () => void;
}

const ACTIVE_STATUSES = new Set(['pending', 'queued', 'running', 'retrying', 'validating']);

interface PollLease {
  scope: TaskPollingScope;
  order: number;
}

const _pollOwners = new Map<string, PollLease>();
let _pollTimer: ReturnType<typeof setTimeout> | null = null;
let _pollGeneration = 0;
let _pollLeaseOrder = 0;
let _pollInFlightGeneration: number | null = null;
let _activeSessionId: string | undefined;
let _requestSequence = 0;
let _latestRequestId = 0;
let _latestRequestSessionId: string | undefined;

function normalizeSessionId(sessionId?: string): string | undefined {
  return sessionId || undefined;
}

function latestPollLease(): PollLease | undefined {
  return Array.from(_pollOwners.values()).reduce<PollLease | undefined>(
    (latest, lease) => !latest || lease.order > latest.order ? lease : latest,
    undefined,
  );
}

function activeSessionForLeases(): string | undefined {
  if (Array.from(_pollOwners.values()).some((lease) => lease.scope.type === 'global')) {
    return undefined;
  }
  const latest = latestPollLease();
  return latest?.scope.type === 'session' ? latest.scope.sessionId : undefined;
}

function clearPollTimer() {
  if (_pollTimer) {
    clearTimeout(_pollTimer);
    _pollTimer = null;
  }
}

function isCurrentRequest(
  requestId: number,
  generation: number,
  sessionId: string | undefined,
): boolean {
  return requestId === _latestRequestId
    && generation === _pollGeneration
    && sessionId === _latestRequestSessionId
    && (_pollOwners.size === 0 || sessionId === _activeSessionId);
}

function beginPolling(get: () => TaskState, sessionId: string | undefined, generation: number) {
  if (_pollOwners.size === 0 || generation !== _pollGeneration || sessionId !== _activeSessionId) return;
  if (_pollInFlightGeneration === generation) return;

  const tick = async () => {
    if (_pollOwners.size === 0 || generation !== _pollGeneration || sessionId !== _activeSessionId) return;
    _pollTimer = null;
    _pollInFlightGeneration = generation;
    const result = await get().loadTasks(sessionId, generation);
    if (_pollInFlightGeneration === generation) {
      _pollInFlightGeneration = null;
    }
    if (_pollOwners.size === 0 || generation !== _pollGeneration || sessionId !== _activeSessionId) return;
    if (result.status === 'success' && result.allTerminal) return;
    _pollTimer = setTimeout(() => {
      void tick();
    }, 3000);
  };

  void tick();
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  selectedTaskId: null,

  loadTasks: async (sessionId?: string, generation = _pollGeneration) => {
    const requestedSessionId = normalizeSessionId(sessionId);
    if (
      generation !== _pollGeneration
      || (_pollOwners.size > 0 && requestedSessionId !== _activeSessionId)
    ) {
      return { status: 'stale', allTerminal: false };
    }
    const requestId = ++_requestSequence;
    _latestRequestId = requestId;
    _latestRequestSessionId = requestedSessionId;
    set({ loading: true });
    try {
      const url = requestedSessionId
        ? `/api/v1/tasks?session_id=${encodeURIComponent(requestedSessionId)}`
        : '/api/v1/tasks';
      const res = await apiFetch(url);
      if (!isCurrentRequest(requestId, generation, requestedSessionId)) {
        return { status: 'stale', allTerminal: false };
      }
      if (!res.ok) return { status: 'failed', allTerminal: false };
      const data = await res.json();
      if (!isCurrentRequest(requestId, generation, requestedSessionId)) {
        return { status: 'stale', allTerminal: false };
      }
      if (!Array.isArray(data)) return { status: 'failed', allTerminal: false };
      set((state) => ({
        tasks: data,
        selectedTaskId:
          state.selectedTaskId && data.some((task: TaskRecord) => task.task_id === state.selectedTaskId)
            ? state.selectedTaskId
            : data[0]?.task_id ?? null,
      }));
      return {
        status: 'success',
        allTerminal: !data.some((task: TaskRecord) => ACTIVE_STATUSES.has(taskRunStatus(task))),
      };
    } catch {
      return isCurrentRequest(requestId, generation, requestedSessionId)
        ? { status: 'failed', allTerminal: false }
        : { status: 'stale', allTerminal: false };
    } finally {
      if (isCurrentRequest(requestId, generation, requestedSessionId)) {
        set({ loading: false });
      }
    }
  },

  deleteTask: async (taskId: string) => {
    await apiFetch(`/api/v1/tasks/${taskId}`, { method: 'DELETE' });
    set((s) => {
      const tasks = s.tasks.filter((t) => t.task_id !== taskId);
      return {
        tasks,
        selectedTaskId: s.selectedTaskId === taskId ? tasks[0]?.task_id ?? null : s.selectedTaskId,
      };
    });
  },

  selectTask: (taskId: string | null) => set({ selectedTaskId: taskId }),

  startPolling: (ownerId: string, scope: TaskPollingScope) => {
    const hadOwners = _pollOwners.size > 0;
    _pollOwners.set(ownerId, {
      scope,
      order: ++_pollLeaseOrder,
    });
    const nextSessionId = activeSessionForLeases();
    const sessionChanged = !hadOwners || nextSessionId !== _activeSessionId;

    if (sessionChanged) {
      _activeSessionId = nextSessionId;
      _pollGeneration += 1;
      clearPollTimer();
      beginPolling(get, nextSessionId, _pollGeneration);
      return;
    }
    if (!_pollTimer && _pollInFlightGeneration !== _pollGeneration) {
      beginPolling(get, nextSessionId, _pollGeneration);
    }
  },

  stopPolling: (ownerId: string) => {
    if (!_pollOwners.delete(ownerId)) return;
    const nextLease = latestPollLease();
    if (!nextLease) {
      _activeSessionId = undefined;
      _pollGeneration += 1;
      clearPollTimer();
      set({ loading: false });
      return;
    }
    const nextSessionId = activeSessionForLeases();
    if (nextSessionId !== _activeSessionId) {
      _activeSessionId = nextSessionId;
      _pollGeneration += 1;
      clearPollTimer();
      beginPolling(get, _activeSessionId, _pollGeneration);
    }
  },

  reset: () => {
    _pollOwners.clear();
    _activeSessionId = undefined;
    _pollGeneration += 1;
    _pollInFlightGeneration = null;
    _latestRequestId = ++_requestSequence;
    _latestRequestSessionId = undefined;
    clearPollTimer();
    set({ tasks: [], loading: false, selectedTaskId: null });
  },
}));

registerSessionCleanup(() => useTaskStore.getState().reset());
