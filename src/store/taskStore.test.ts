import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../api/client';
import { GLOBAL_TASK_POLL_SCOPE, useTaskStore } from './taskStore';

const mockApiFetch = vi.mocked(apiFetch);
const OWNER_A = 'task-store-test-a';
const OWNER_B = 'task-store-test-b';

function jsonResponse(data: unknown, ok = true) {
  return { ok, json: async () => data } as Response;
}

describe('taskStore', () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [], loading: false, selectedTaskId: null });
    mockApiFetch.mockReset();
  });
  afterEach(() => {
    useTaskStore.getState().stopPolling(OWNER_A);
    useTaskStore.getState().stopPolling(OWNER_B);
    vi.useRealTimers();
  });

  it('loadTasks 成功填充任务并默认选中第一个', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([
      { task_id: 't1', status: 'completed' },
      { task_id: 't2', status: 'running' },
    ]));

    await useTaskStore.getState().loadTasks('s1');

    const state = useTaskStore.getState();
    expect(state.tasks).toHaveLength(2);
    expect(state.selectedTaskId).toBe('t1');
    expect(state.loading).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/tasks?session_id=s1');
  });

  it('loadTasks 保留仍存在的选中项，丢失则回退第一个', async () => {
    useTaskStore.setState({ selectedTaskId: 't2' });
    mockApiFetch.mockResolvedValue(jsonResponse([
      { task_id: 't1' }, { task_id: 't2' },
    ]));
    await useTaskStore.getState().loadTasks();
    expect(useTaskStore.getState().selectedTaskId).toBe('t2');

    mockApiFetch.mockResolvedValue(jsonResponse([{ task_id: 't9' }]));
    await useTaskStore.getState().loadTasks();
    expect(useTaskStore.getState().selectedTaskId).toBe('t9');
  });

  it('接口失败/返回非数组时静默保持原状态', async () => {
    useTaskStore.setState({ tasks: [{ task_id: 'keep' } as never] });
    mockApiFetch.mockResolvedValue(jsonResponse({ error: 'x' }, false));
    await useTaskStore.getState().loadTasks();
    expect(useTaskStore.getState().tasks).toHaveLength(1);

    mockApiFetch.mockResolvedValue(jsonResponse({ not: 'array' }));
    await useTaskStore.getState().loadTasks();
    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });

  it('startPolling 立即加载一次并按周期轮询，stopPolling 停止', async () => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue(jsonResponse([{ task_id: 't1', status: 'running' }]));

    useTaskStore.getState().startPolling(OWNER_A, { type: 'session', sessionId: 's1' });
    expect(mockApiFetch).toHaveBeenCalledTimes(1); // 启动即加载

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);

    useTaskStore.getState().stopPolling(OWNER_A);
    await vi.advanceTimersByTimeAsync(9000);
    expect(mockApiFetch).toHaveBeenCalledTimes(2); // 停止后不再请求
  });

  it('重复 startPolling 不叠加定时器', async () => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue(jsonResponse([{ task_id: 't1', status: 'running' }]));

    useTaskStore.getState().startPolling(OWNER_A, GLOBAL_TASK_POLL_SCOPE);
    useTaskStore.getState().startPolling(OWNER_A, GLOBAL_TASK_POLL_SCOPE);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('retrying 状态保持 3 秒轮询', async () => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue(jsonResponse([{ task_id: 't1', status: 'retrying' }]));

    useTaskStore.getState().startPolling(OWNER_A, GLOBAL_TASK_POLL_SCOPE);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['空列表', []],
    ['仅旧版终态任务', [{ task_id: 't1', status: 'completed' }, { task_id: 't2', status: 'failed' }]],
  ])('遇到%s后停止轮询', async (_name, tasks) => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue(jsonResponse(tasks));

    useTaskStore.getState().startPolling(OWNER_A, GLOBAL_TASK_POLL_SCOPE);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(9000);

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('一个 owner 释放后其他 owner 仍保持轮询', async () => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue(jsonResponse([{ task_id: 't1', status: 'running' }]));

    useTaskStore.getState().startPolling(OWNER_A, GLOBAL_TASK_POLL_SCOPE);
    useTaskStore.getState().startPolling(OWNER_B, GLOBAL_TASK_POLL_SCOPE);
    await vi.advanceTimersByTimeAsync(0);
    useTaskStore.getState().stopPolling(OWNER_A);
    await vi.advanceTimersByTimeAsync(3000);

    expect(mockApiFetch).toHaveBeenCalledTimes(2);

    useTaskStore.getState().stopPolling(OWNER_B);
    await vi.advanceTimersByTimeAsync(6000);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('首次请求失败后保留 timer 并在 3 秒后重试', async () => {
    vi.useFakeTimers();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ error: 'temporary' }, false))
      .mockResolvedValueOnce(jsonResponse([{ task_id: 't1', status: 'completed' }]));

    useTaskStore.getState().startPolling(OWNER_A, GLOBAL_TASK_POLL_SCOPE);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(useTaskStore.getState().tasks).toEqual([{ task_id: 't1', status: 'completed' }]);
  });

  it('丢弃旧 session 的乱序响应', async () => {
    let resolveOld!: (response: Response) => void;
    let resolveNew!: (response: Response) => void;
    mockApiFetch
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));

    useTaskStore.getState().startPolling(OWNER_A, { type: 'session', sessionId: 'old-session' });
    useTaskStore.getState().startPolling(OWNER_A, { type: 'session', sessionId: 'new-session' });

    resolveNew(jsonResponse([{ task_id: 'new', status: 'completed' }]));
    await Promise.resolve();
    await Promise.resolve();
    expect(useTaskStore.getState().tasks).toEqual([{ task_id: 'new', status: 'completed' }]);

    resolveOld(jsonResponse([{ task_id: 'old', status: 'running' }]));
    await Promise.resolve();
    await Promise.resolve();
    expect(useTaskStore.getState().tasks).toEqual([{ task_id: 'new', status: 'completed' }]);
  });

  it('存在 global owner 时忽略最新 session scope 并持续请求全量任务', async () => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue(jsonResponse([{ task_id: 'global', status: 'running' }]));

    useTaskStore.getState().startPolling(OWNER_A, GLOBAL_TASK_POLL_SCOPE);
    useTaskStore.getState().startPolling(OWNER_B, { type: 'session', sessionId: 'session-1' });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/api/v1/tasks');
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/api/v1/tasks');
  });
});
