import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({
  apiFetch,
  apiStreamFetch: vi.fn(),
}));

import { cancelAgentRun, resumeAgentRun } from './agentRuns';

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const commandResult = {
  accepted: true,
  run_id: 'run-1',
  run_status: 'queued',
  task_status: 'running',
  event_cursor: 7,
};

describe('agent run command clients', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('sends an additional-data resume command and returns its validated cursor', async () => {
    apiFetch.mockResolvedValue(response(commandResult));

    await expect(resumeAgentRun('run-1', 'request-1', '补充线下流水已就绪')).resolves.toEqual(commandResult);

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/agent-runs/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: 'run-1',
        request_id: 'request-1',
        payload: { type: 'additional_data', additional_data: { message: '补充线下流水已就绪' } },
      }),
    });
  });

  it('sends a cancel command and rejects an invalid event cursor', async () => {
    apiFetch
      .mockResolvedValueOnce(response({ ...commandResult, event_cursor: -1 }))
      .mockResolvedValueOnce(response(commandResult));

    await expect(resumeAgentRun('run-1', 'request-1', '资料')).rejects.toThrow('研究任务恢复失败');
    await expect(cancelAgentRun('run-1', 'request-2')).resolves.toEqual(commandResult);

    expect(apiFetch).toHaveBeenLastCalledWith('/api/v1/agent-runs/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: 'run-1', request_id: 'request-2' }),
    });
  });

  it.each([
    ['resume', '研究任务恢复失败'],
    ['cancel', '研究任务取消失败'],
  ])('uses only string error detail for %s failures', async (command, fallback) => {
    apiFetch.mockResolvedValueOnce(response({ detail: { internal: 'secret' } }, false));
    const request = command === 'resume'
      ? resumeAgentRun('run-1', 'request-1', '资料')
      : cancelAgentRun('run-1', 'request-1');
    await expect(request).rejects.toThrow(fallback);

    apiFetch.mockResolvedValueOnce(response({ detail: '可安全展示的提示' }, false));
    const retry = command === 'resume'
      ? resumeAgentRun('run-1', 'request-2', '资料')
      : cancelAgentRun('run-1', 'request-2');
    await expect(retry).rejects.toThrow('可安全展示的提示');
  });
});
