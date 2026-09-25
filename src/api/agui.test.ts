import { describe, expect, it, vi } from 'vitest';
import { apiStreamFetch } from './client';
import { streamAguiRun } from './agui';
import type { AguiRunInput } from '../types/agui';

vi.mock('./client', () => ({ apiStreamFetch: vi.fn(), apiFetch: vi.fn() }));

const input: AguiRunInput = {
  threadId: 'thread-1', runId: 'run-1', parentRunId: null, state: {},
  messages: [{ id: 'message-1', role: 'user', content: '你好' }],
  tools: [], context: [], forwardedProps: {},
};

describe('AG-UI HTTP errors', () => {
  it('shows the authorization reason for a rejected workspace', async () => {
    const release = vi.fn();
    vi.mocked(apiStreamFetch).mockResolvedValueOnce({
      response: new Response(JSON.stringify({ detail: '无权访问该工作空间' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      }),
      signal: new AbortController().signal,
      release,
    });

    await expect(streamAguiRun(input, new AbortController().signal).next()).rejects.toThrow('无权访问该工作空间');
    expect(release).toHaveBeenCalledOnce();
  });
});
