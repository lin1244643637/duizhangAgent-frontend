import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiStreamFetch } from '../api/client';
import { notification } from 'antd';
import { clearSessionState } from '../api/sessionLifecycle';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useAgentChat } from './useAgentChat';
import type { AguiRunInput } from '../types/agui';

vi.mock('../api/client', () => ({ apiFetch: vi.fn(), apiStreamFetch: vi.fn() }));
vi.mock('antd', () => ({ notification: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

const assistant = () => {
  const messages = useChatStore.getState().sessions.find((s) => s.id === 'thread-1')!.messages.filter((m) => m.role === 'assistant');
  return messages[messages.length - 1];
};
const inputAt = (index = 0) => JSON.parse(vi.mocked(apiStreamFetch).mock.calls[index][1]!.body as string) as AguiRunInput;
const frame = (input: AguiRunInput, ordinal: number, type: string, data: Record<string, unknown> = {}) => `data: ${JSON.stringify({
  type, runId: input.runId, threadId: input.threadId, eventId: `${input.runId}:1:${ordinal}`,
  sequence: 1, createdAt: '2026-09-21T10:00:00+08:00', ...data,
})}\r\n\r\n`;
const textFrames = (input: AguiRunInput) => frame(input, 0, 'RUN_STARTED')
  + frame(input, 1, 'TEXT_MESSAGE_START', { messageId: 'text-1', role: 'assistant' })
  + frame(input, 2, 'TEXT_MESSAGE_CONTENT', { messageId: 'text-1', delta: '你好' });

function mockStream(events: (input: AguiRunInput) => string, hold = false, sessionId?: string) {
  let channel: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const release = vi.fn();
  let body: ReadableStream<Uint8Array>;
  vi.mocked(apiStreamFetch).mockImplementationOnce(async (_url, options) => {
    const input = JSON.parse(options!.body as string) as AguiRunInput;
    body = new ReadableStream<Uint8Array>({
      start(controller) {
        channel = controller;
        controller.enqueue(new TextEncoder().encode(events(input)));
        if (!hold) controller.close();
      }, cancel,
    });
    return { response: new Response(body, { headers: {
      'Content-Type': 'text/event-stream',
      ...(sessionId ? { 'X-AGUI-Session-ID': sessionId } : {}),
    } }), signal: options!.signal as AbortSignal, release };
  });
  return { cancel, release, emit: (events: string) => channel.enqueue(new TextEncoder().encode(events)), locked: () => body.locked };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('VITE_AGUI_CHAT_ENABLED', 'true');
  useAuthStore.setState({ workspaceType: 'tenant', tenantId: 'tenant-1', activeWorkspaceId: 'tenant-1' });
  useChatStore.setState({ activeSessionId: 'thread-1', pendingApproval: null, sessions: [
    { id: 'thread-1', title: '新对话', messages: [], createdAt: 0, pending: true, conversationMode: 'agui' },
  ] });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('AG-UI opt-in conversation', () => {
  it('uses the same AG-UI endpoint for a personal workspace', async () => {
    useAuthStore.setState({ workspaceType: 'personal', tenantId: undefined, activeWorkspaceId: undefined });
    mockStream((input) => frame(input, 0, 'RUN_STARTED') + frame(input, 1, 'RUN_FINISHED'), false, 'personal:personal-a:thread-1');
    const { result } = renderHook(() => useAgentChat());

    await act(async () => { expect(await result.current.sendMessage('你好')).toBe(true); });

    expect(apiStreamFetch).toHaveBeenCalledWith('/api/v1/agui/runs', expect.anything());
    expect(apiFetch).not.toHaveBeenCalledWith('/api/v1/chat', expect.anything());
    expect(useChatStore.getState().sessions[0]?.id).toBe('personal:personal-a:thread-1');
  });

  it('posts the documented shape, deduplicates full event IDs and keeps legacy transports unused', async () => {
    vi.mocked(apiFetch).mockImplementationOnce(async (_url, options) => {
      const input = JSON.parse(options!.body as string) as AguiRunInput;
      return new Response(JSON.stringify({ threadId: input.threadId, runId: input.runId, status: 'completed', content: '你好，世界' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const stream = mockStream((input) => textFrames(input)
      + frame(input, 2, 'TEXT_MESSAGE_CONTENT', { messageId: 'text-1', delta: '你好' })
      + frame(input, 3, 'TEXT_MESSAGE_CONTENT', { messageId: 'text-1', delta: '，世界' })
      + frame(input, 4, 'TEXT_MESSAGE_END', { messageId: 'text-1' })
      + frame(input, 5, 'RUN_FINISHED'));
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { expect(await result.current.sendMessage('查询本周销售')).toBe(true); });
    expect(apiStreamFetch).toHaveBeenCalledWith('/api/v1/agui/runs', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    }));
    expect(inputAt()).toEqual({
      threadId: 'thread-1', runId: expect.any(String), parentRunId: null, state: {},
      messages: [{ id: expect.any(String), role: 'user', content: '查询本周销售' }], tools: [], context: [], forwardedProps: {},
    });
    expect(inputAt().runId).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
    expect(assistant()).toMatchObject({ content: '你好，世界', streaming: false, stage: null, agui: { status: 'completed' } });
    expect(useChatStore.getState().sessions[0]).toMatchObject({ id: 'thread-1', pending: false, loaded: true });
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/agui/runs', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(inputAt()),
    }));
    expect(stream.release).toHaveBeenCalledTimes(1);
    expect(stream.locked()).toBe(false);
  });

  it('sends a clarification choice through AG-UI forwardedProps', async () => {
    mockStream((input) => frame(input, 0, 'RUN_FINISHED'));
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      expect(await result.current.sendMessage('查看经营销售数据', undefined, {
        kind: 'clarification_choice',
        source_turn_id: 'turn-previous',
        candidate_id: 'analytics:sales_summary',
      })).toBe(true);
    });

    expect(inputAt().forwardedProps).toEqual({
      interaction: {
        kind: 'clarification_choice',
        source_turn_id: 'turn-previous',
        candidate_id: 'analytics:sales_summary',
      },
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/agui/runs', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    }));
  });

  it('uses the JSON result to complete missing text without repeating the run', async () => {
    vi.mocked(apiFetch).mockImplementationOnce(async (_url, options) => {
      const input = JSON.parse(options!.body as string) as AguiRunInput;
      return new Response(JSON.stringify({
        threadId: input.threadId, runId: input.runId,
        status: 'completed', content: '你好，世界',
      }), { headers: { 'Content-Type': 'application/json' } });
    });
    mockStream((input) => textFrames(input) + frame(input, 3, 'RUN_FINISHED'));

    const { result } = renderHook(() => useAgentChat());
    await act(async () => { expect(await result.current.sendMessage('查询')).toBe(true); });

    expect(assistant()).toMatchObject({ content: '你好，世界', agui: { status: 'completed' } });
    expect(apiStreamFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the completed streamed answer when JSON retrieval fails', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('snapshot unavailable'));
    mockStream((input) => textFrames(input) + frame(input, 3, 'RUN_FINISHED'));

    const { result } = renderHook(() => useAgentChat());
    await act(async () => { expect(await result.current.sendMessage('查询')).toBe(true); });

    expect(assistant()).toMatchObject({ content: '你好', agui: { status: 'completed' } });
    expect(notification.error).not.toHaveBeenCalled();
  });

  it('stops at RUN_ERROR even when later events share the same network chunk', async () => {
    const stream = mockStream((input) => textFrames(input)
      + frame(input, 3, 'RUN_ERROR', { code: 'agent_failed', message: '处理失败' })
      + frame(input, 4, 'TEXT_MESSAGE_CONTENT', { messageId: 'text-1', delta: '不应显示' }), true);
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { expect(await result.current.sendMessage('查询')).toBe(false); });
    expect(assistant()).toMatchObject({ content: '你好', streaming: false, stage: null, agui: { status: 'failed', detail: '处理失败' } });
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    expect(stream.release).toHaveBeenCalledTimes(1);
    expect(notification.error).toHaveBeenCalledWith(expect.objectContaining({ duration: 5, closable: true }));
  });

  it('keeps the retry decision supplied by RUN_ERROR', async () => {
    mockStream((input) => frame(input, 0, 'RUN_STARTED')
      + frame(input, 1, 'RUN_ERROR', { code: 'model_failed', message: '模型暂时不可用', retryable: true }), true);
    const { result } = renderHook(() => useAgentChat());

    await act(async () => { expect(await result.current.sendMessage('查询')).toBe(false); });

    expect(assistant().agui).toMatchObject({ status: 'failed', retryable: true });
  });

  it('reconnects an incomplete run using the identical request and last applied cursor', async () => {
    mockStream(textFrames);
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { expect(await result.current.sendMessage('查询')).toBe(false); });
    const original = inputAt();
    expect(assistant().agui?.status).toBe('disconnected');
    await act(async () => { expect(await result.current.sendMessage('重复发送')).toBe(false); });
    mockStream((input) => frame(input, 2, 'TEXT_MESSAGE_CONTENT', { messageId: 'text-1', delta: '你好' })
      + frame(input, 3, 'TEXT_MESSAGE_CONTENT', { messageId: 'text-1', delta: '完成' }) + frame(input, 4, 'RUN_FINISHED'));
    await act(async () => { await result.current.reconnectAguiRun(original.runId); });
    expect(inputAt(1)).toEqual(original);
    expect(apiStreamFetch).toHaveBeenLastCalledWith('/api/v1/agui/runs', expect.objectContaining({
      headers: expect.objectContaining({ 'Last-Event-ID': `${original.runId}:1:2` }),
    }));
    expect(assistant()).toMatchObject({ content: '你好完成', agui: { status: 'completed' } });
    expect(useChatStore.getState().sessions[0].messages).toHaveLength(2);
  });

  it('does not finish at text/tool end and only displays safe tool result fields', async () => {
    const stream = mockStream((input) => textFrames(input)
      + frame(input, 3, 'TEXT_MESSAGE_END', { messageId: 'text-1' })
      + frame(input, 4, 'TOOL_CALL_START', { toolCallId: 'tool-1', toolCallName: 'internal_name' })
      + frame(input, 5, 'TOOL_CALL_ARGS', { toolCallId: 'tool-1', delta: '{"secret":"hidden"}' })
      + frame(input, 6, 'TOOL_CALL_END', { toolCallId: 'tool-1' })
      + frame(input, 7, 'TOOL_CALL_RESULT', { toolCallId: 'tool-1', content: '{"label":"读取经营数据","status":"completed","secret":"hidden"}' }), true);
    const { result } = renderHook(() => useAgentChat());
    let sending: Promise<unknown>;
    await act(async () => { sending = result.current.sendMessage('查询'); });
    expect(assistant().streaming).toBe(true);
    expect(assistant().activity?.steps).toEqual([expect.objectContaining({ detail: '读取经营数据', status: 'completed' })]);
    expect(JSON.stringify(assistant())).not.toContain('hidden');
    await act(async () => { stream.emit(frame(inputAt(), 8, 'RUN_FINISHED')); await sending; });
    expect(assistant().streaming).toBe(false);
  });

  it('keeps an approval interrupt distinct and resumes the same run after a confirmed decision', async () => {
    mockStream((input) => frame(input, 0, 'STATE_SNAPSHOT', { snapshot: { approval: {
      approval_id: 'approval-1', tool_label: '发送通知', message: '确认发送通知吗？', expires_at: '2026-09-21T10:15:00+08:00',
    } } }) + frame(input, 1, 'RUN_FINISHED', { outcome: { type: 'interrupt', interrupts: [] } }));
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.sendMessage('查询'); });
    expect(assistant()).toMatchObject({ streaming: false, agui: {
      status: 'waiting_for_approval',
      detail: '确认发送通知吗？',
      approval: { id: 'approval-1', toolLabel: '发送通知' },
    } });
    expect(useChatStore.getState().pendingApproval).toBeNull();
    await act(async () => { expect(await result.current.sendMessage('同意执行')).toBe(false); });
    const run = inputAt();
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      accepted: true, run_id: run.runId, run_status: 'queued', task_status: 'queued',
    }), { headers: { 'Content-Type': 'application/json' } }));
    mockStream((input) => frame(input, 2, 'RUN_STARTED') + frame(input, 3, 'RUN_FINISHED'));
    await act(async () => { expect(await result.current.decideAguiApproval(run.runId, 'approve')).toBe(true); });
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/agent-runs/approve-action', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"decision":"approve"'),
    }));
    expect(inputAt(1)).toEqual(run);
    expect(apiStreamFetch).toHaveBeenLastCalledWith('/api/v1/agui/runs', expect.objectContaining({
      headers: expect.objectContaining({ 'Last-Event-ID': `${run.runId}:1:1` }),
    }));
    expect(assistant().agui?.status).toBe('completed');
  });

  it.each(['cancelled', 'interrupt'] as const)('does not mislabel a %s terminal outcome as completed', async (kind) => {
    mockStream((input) => frame(input, 0, 'RUN_FINISHED', kind === 'cancelled' ? { result: { status: kind } } : { outcome: { type: kind } }));
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.sendMessage('查询'); });
    expect(assistant().agui?.status).toBe(kind === 'cancelled' ? 'cancelled' : 'interrupted');
  });

  it('only marks a run cancelled after server confirmation, reusing request_id after failure', async () => {
    const stream = mockStream(textFrames, true);
    const { result } = renderHook(() => useAgentChat());
    let sending: Promise<unknown>;
    await act(async () => { sending = result.current.sendMessage('查询'); });
    const runId = inputAt().runId;
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await expect(result.current.cancelAguiRun(runId)).rejects.toThrow('offline'); });
    expect(assistant().streaming).toBe(true);
    expect(stream.cancel).not.toHaveBeenCalled();
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      accepted: true, run_id: runId, run_status: 'cancelled', task_status: 'cancelled', event_cursor: 2,
    })));
    await act(async () => { await result.current.cancelAguiRun(runId); await sending; });
    const bodies = vi.mocked(apiFetch).mock.calls.map((call) => JSON.parse(call[1]!.body as string));
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[0]).toEqual({ run_id: runId, request_id: expect.any(String) });
    expect(assistant()).toMatchObject({ streaming: false, stage: null, agui: { status: 'cancelled' } });
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  it('does not confirm a merely accepted cancellation while the run remains running', async () => {
    mockStream(textFrames);
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.sendMessage('查询'); });
    const runId = inputAt().runId;
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, run_id: runId, run_status: 'running', task_status: 'running', event_cursor: 2 })));
    await act(async () => { await expect(result.current.cancelAguiRun(runId)).rejects.toThrow('尚未确认'); });
    expect(assistant().agui?.status).toBe('disconnected');
  });

  it.each(['navigation', 'unmount', 'logout'] as const)('cleans up on %s without sending a server cancellation', async (reason) => {
    const stream = mockStream(textFrames, true);
    const { result, unmount } = renderHook(() => useAgentChat());
    let sending: Promise<unknown>;
    await act(async () => { sending = result.current.sendMessage('查询'); });
    await act(async () => {
      if (reason === 'navigation') useChatStore.getState().resetToNewSession();
      else if (reason === 'unmount') unmount();
      else clearSessionState();
      await sending;
    });
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    expect(stream.release).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalled();
    if (reason !== 'logout') expect(assistant()).toMatchObject({ streaming: false, stage: null, agui: { status: 'disconnected' } });
  });

  it('fails closed on mismatched ownership envelopes and never falls back to legacy', async () => {
    mockStream((input) => frame(input, 0, 'RUN_STARTED', { threadId: 'another-tenant-thread' }));
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { expect(await result.current.sendMessage('查询')).toBe(false); });
    expect(assistant().agui?.status).toBe('disconnected');
    expect(assistant().content).toBe('');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('gates the mode, keeps it fixed after start, and reuses the upload transport for files', async () => {
    const store = useChatStore.getState();
    store.setConversationMode('thread-1', 'legacy');
    vi.stubEnv('VITE_AGUI_CHAT_ENABLED', 'false');
    store.setConversationMode('thread-1', 'agui');
    expect(useChatStore.getState().sessions[0].conversationMode).toBe('legacy');
    vi.stubEnv('VITE_AGUI_CHAT_ENABLED', 'true');
    store.setConversationMode('thread-1', 'agui');
    const { result } = renderHook(() => useAgentChat());
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      session_id: 'thread-1', task_id: 'upload-task-1',
    }), { headers: { 'Content-Type': 'application/json' } }));
    await act(async () => { expect(await result.current.sendMessage('文件', { files: [new File(['data'], 'test.csv')] })).toBe(true); });
    expect(apiStreamFetch).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/chat/upload/async', expect.objectContaining({ method: 'POST' }));
    mockStream((input) => frame(input, 0, 'RUN_FINISHED'));
    await act(async () => { await result.current.sendMessage('查询'); });
    store.setConversationMode('thread-1', 'legacy');
    expect(useChatStore.getState().sessions[0].conversationMode).toBe('agui');
  });

  it('keeps one thread and creates a new run for a later completed turn', async () => {
    const { result } = renderHook(() => useAgentChat());
    for (const question of ['第一轮', '第二轮']) {
      mockStream((input) => textFrames(input) + frame(input, 3, 'RUN_FINISHED'));
      await act(async () => { await result.current.sendMessage(question); });
    }
    expect(inputAt(1).threadId).toBe(inputAt().threadId);
    expect(inputAt(1).runId).not.toBe(inputAt().runId);
    expect(inputAt(1).messages[0].content).toBe('第二轮');
    expect(useChatStore.getState().sessions[0].messages).toHaveLength(4);
    expect(result.current.canReconnectAguiRun(inputAt().runId)).toBe(false);
  });

  it.each([401, 404, 409, 422, 503])('does not fall back after HTTP %s and releases the failed response', async (status) => {
    const release = vi.fn();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.mocked(apiStreamFetch).mockResolvedValueOnce({
      response: new Response(body, { status }), signal: new AbortController().signal, release,
    });
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { expect(await result.current.sendMessage('查询')).toBe(false); });
    expect(assistant()).toMatchObject({ streaming: false, agui: { status: 'disconnected' } });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('does not commit a malformed text event cursor and retains content on replay', async () => {
    mockStream((input) => textFrames(input) + frame(input, 3, 'TEXT_MESSAGE_CONTENT', { messageId: 'wrong-message', delta: 'wrong' }));
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.sendMessage('查询'); });
    mockStream((input) => frame(input, 3, 'TEXT_MESSAGE_CONTENT', { messageId: 'text-1', delta: '重连成功' }) + frame(input, 4, 'RUN_FINISHED'));
    await act(async () => { await result.current.reconnectAguiRun(inputAt().runId); });
    expect(apiStreamFetch).toHaveBeenLastCalledWith('/api/v1/agui/runs', expect.objectContaining({
      headers: expect.objectContaining({ 'Last-Event-ID': `${inputAt().runId}:1:2` }),
    }));
    expect(assistant().content).toBe('你好重连成功');
  });

  it('accepts only validated structured metadata and never renders unknown raw snapshots', async () => {
    const response = {
      version: 1, domain: 'business', task: 'query', result_status: 'ok', result_id: 'result-1',
      source_turn_id: 'turn-1', parts: [{ kind: 'summary', message: '已获得结果' }],
    };
    mockStream((input) => textFrames(input)
      + frame(input, 3, 'STATE_SNAPSHOT', { snapshot: { agent_response: { internal: 'secret' } } })
      + frame(input, 4, 'STATE_SNAPSHOT', { snapshot: { agent_response: response } })
      + frame(input, 5, 'RUN_FINISHED'));
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.sendMessage('查询'); });
    expect(assistant().agentResponse).toMatchObject(response);
    expect(JSON.stringify(assistant())).not.toContain('secret');
  });

  it('uses the shared session APIs for AG-UI history and deletion', async () => {
    mockStream((input) => frame(input, 0, 'RUN_FINISHED'));
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.sendMessage('查询'); });
    const store = useChatStore.getState();
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 204 }));
    await act(async () => {
      store.setActiveSession('thread-1');
      store.deleteMessagePair('thread-1', assistant().id);
      await store.deleteSession('thread-1');
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/sessions/thread-1/messages', expect.objectContaining({ method: 'DELETE' }));
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/sessions/thread-1', { method: 'DELETE' });
    expect(useChatStore.getState().sessions).toHaveLength(0);
  });
});
