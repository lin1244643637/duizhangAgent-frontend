/* @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiStreamFetch } from '../../api/client';
import type { AgentRunPublicEvent } from '../../types/agentRun';
import { useAgentRunEvents } from '../useAgentRunEvents';

vi.mock('../../api/client', () => ({ apiStreamFetch: vi.fn() }));

const mockApiStreamFetch = vi.mocked(apiStreamFetch);

function sseResponse(events: unknown[]): Response {
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  const bytes = new TextEncoder().encode(payload);
  let sent = false;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: vi.fn(async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        }),
        cancel: vi.fn(async () => undefined),
        releaseLock: vi.fn(),
      }),
    },
  } as unknown as Response;
}

function streamResponse(events: unknown[]) {
  return {
    response: sseResponse(events),
    signal: new AbortController().signal,
    release: vi.fn(),
  };
}

function rawStreamResponse(raw: string, ok = true) {
  const bytes = new TextEncoder().encode(raw);
  let sent = false;
  return {
    response: {
      ok,
      status: ok ? 200 : 400,
      body: {
        getReader: () => ({
          read: vi.fn(async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          }),
          cancel: vi.fn(async () => undefined),
          releaseLock: vi.fn(),
        }),
      },
    } as unknown as Response,
    signal: new AbortController().signal,
    release: vi.fn(),
  };
}

function event(sequence: number, type = 'progress', data: Record<string, unknown> = {}, runId = 'run-1') {
  return {
    run_id: runId,
    sequence,
    type,
    data,
    created_at: '2026-08-10T10:00:00+08:00',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe('useAgentRunEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockApiStreamFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconnects from the last committed sequence and ignores duplicates', async () => {
    mockApiStreamFetch
      .mockResolvedValueOnce(streamResponse([event(1), event(2)]))
      .mockResolvedValueOnce(streamResponse([
        event(2),
        event(3, 'final', { status: 'completed', text: '研究结论' }),
      ]));
    const updates: AgentRunPublicEvent[] = [];
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => {
      result.current.start('run-1', { onEvent: (item) => updates.push(item) });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(updates.map((item) => item.sequence)).toEqual([1, 2, 3]);
    expect(updates[2]?.text).toBe('研究结论');
    expect(mockApiStreamFetch).toHaveBeenCalledTimes(2);
    expect(mockApiStreamFetch).toHaveBeenNthCalledWith(2, '/api/v1/agent-runs/events', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ run_id: 'run-1', after_sequence: 2 }),
    }));
  });

  it('starts from a supplied cursor and does not replay that cursor', async () => {
    mockApiStreamFetch.mockResolvedValue(streamResponse([
      event(7),
      event(8, 'final', { status: 'completed', text: '恢复后的结论' }),
    ]));
    const updates: AgentRunPublicEvent[] = [];
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => {
      result.current.start('run-1', { onEvent: (item) => updates.push(item) }, 7);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockApiStreamFetch).toHaveBeenCalledWith('/api/v1/agent-runs/events', expect.objectContaining({
      body: JSON.stringify({ run_id: 'run-1', after_sequence: 7 }),
    }));
    expect(updates.map((item) => item.sequence)).toEqual([8]);
  });

  it.each([
    ['final', event(1, 'final', { status: 'completed' })],
    ['failed', event(1, 'failed', { status: 'failed' })],
  ])('waits for an async %s event handler before terminal cleanup', async (_name, terminalEvent) => {
    const refresh = deferred<void>();
    const onCleanup = vi.fn();
    mockApiStreamFetch.mockResolvedValue(streamResponse([terminalEvent]));
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', {
      onEvent: async () => { await refresh.promise; },
      onCleanup,
    }));
    await act(async () => { await Promise.resolve(); });

    expect(onCleanup).not.toHaveBeenCalled();
    await act(async () => {
      refresh.resolve();
      await Promise.resolve();
    });
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it.each([
    'waiting_for_data',
    'waiting_for_approval',
    'needs_review',
  ] as const)('waits for an async %s handler before pause cleanup', async (status) => {
    const refresh = deferred<void>();
    const onCleanup = vi.fn();
    mockApiStreamFetch.mockResolvedValue(streamResponse([
      event(1, 'status', { status }),
    ]));
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', {
      onEvent: async () => { await refresh.promise; },
      onCleanup,
    }));
    await act(async () => { await Promise.resolve(); });

    expect(onCleanup).not.toHaveBeenCalled();
    await act(async () => {
      refresh.resolve();
      await Promise.resolve();
    });
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('projects an approval-request waiting status and cleans up after its handler', async () => {
    const refresh = deferred<void>();
    const onEvent = vi.fn(async () => { await refresh.promise; });
    const onCleanup = vi.fn();
    mockApiStreamFetch.mockResolvedValue(streamResponse([
      event(1, 'approval_request', { status: 'waiting_for_approval', label: '操作待批准' }),
    ]));
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', { onEvent, onCleanup }));
    await act(async () => { await Promise.resolve(); });

    expect(onEvent).toHaveBeenCalledWith({
      sequence: 1,
      type: 'approval_request',
      status: 'waiting_for_approval',
      label: '操作待批准',
    });
    expect(onCleanup).not.toHaveBeenCalled();
    await act(async () => {
      refresh.resolve();
      await Promise.resolve();
    });
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('keeps concurrent runs independent through their terminal events', async () => {
    let resolveRunOne!: (response: ReturnType<typeof streamResponse>) => void;
    let resolveRunTwo!: (response: ReturnType<typeof streamResponse>) => void;
    mockApiStreamFetch
      .mockReturnValueOnce(new Promise((resolve) => { resolveRunOne = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveRunTwo = resolve; }));
    const runOneEvents: AgentRunPublicEvent[] = [];
    const runTwoEvents: AgentRunPublicEvent[] = [];
    const runOneCleanup = vi.fn();
    const runTwoCleanup = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', {
      onEvent: (item) => runOneEvents.push(item),
      onCleanup: runOneCleanup,
    }));
    act(() => result.current.start('run-2', {
      onEvent: (item) => runTwoEvents.push(item),
      onCleanup: runTwoCleanup,
    }));

    const runOneSignal = (mockApiStreamFetch.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
    const runTwoSignal = (mockApiStreamFetch.mock.calls[1]?.[1] as RequestInit).signal as AbortSignal;
    expect(runOneSignal.aborted).toBe(false);
    expect(runOneCleanup).not.toHaveBeenCalled();

    await act(async () => {
      resolveRunOne(streamResponse([
        event(1, 'final', { status: 'completed', text: '结论一' }, 'run-1'),
      ]));
      await Promise.resolve();
    });

    expect(runOneEvents.map((item) => item.text)).toEqual(['结论一']);
    expect(runOneCleanup).toHaveBeenCalledTimes(1);
    expect(runTwoSignal.aborted).toBe(false);
    expect(runTwoCleanup).not.toHaveBeenCalled();

    await act(async () => {
      resolveRunTwo(streamResponse([
        event(1, 'final', { status: 'completed', text: '结论二' }, 'run-2'),
      ]));
      await Promise.resolve();
    });

    expect(runTwoEvents.map((item) => item.text)).toEqual(['结论二']);
    expect(runTwoCleanup).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['terminal', event(1, 'final', { status: 'completed' })],
    ['error', event(1, 'failed', { status: 'failed', detail: '执行失败' })],
  ])('%s event aborts the fetch and clears stage state', async (_name, terminalEvent) => {
    mockApiStreamFetch.mockResolvedValue(streamResponse([terminalEvent]));
    const onCleanup = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => {
      result.current.start('run-1', { onEvent: vi.fn(), onCleanup });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const signal = (mockApiStreamFetch.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('user cancellation aborts the fetch and clears stage state', () => {
    mockApiStreamFetch.mockImplementation(() => new Promise(() => undefined));
    const onCleanup = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => {
      result.current.start('run-1', { onEvent: vi.fn(), onCleanup });
      result.current.cancel();
    });

    const signal = (mockApiStreamFetch.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('cancels only the named durable run', () => {
    mockApiStreamFetch.mockImplementation(() => new Promise(() => undefined));
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => {
      result.current.start('run-1', { onEvent: vi.fn(), onCleanup: firstCleanup });
      result.current.start('run-2', { onEvent: vi.fn(), onCleanup: secondCleanup });
      result.current.cancel('run-1');
    });

    const firstSignal = (mockApiStreamFetch.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
    const secondSignal = (mockApiStreamFetch.mock.calls[1]?.[1] as RequestInit).signal as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);
    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(secondCleanup).not.toHaveBeenCalled();
  });

  it('unmount aborts the fetch and clears stage state', () => {
    mockApiStreamFetch.mockImplementation(() => new Promise(() => undefined));
    const onCleanup = vi.fn();
    const { result, unmount } = renderHook(() => useAgentRunEvents());

    act(() => {
      result.current.start('run-1', { onEvent: vi.fn(), onCleanup });
    });
    unmount();

    const signal = (mockApiStreamFetch.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('exposes only whitelisted public fields', async () => {
    mockApiStreamFetch.mockResolvedValue(streamResponse([
      event(1, 'final', {
        status: 'completed',
        text: '公开结论',
        arguments: { secret: true },
        authorization_snapshot: { tenant_id: 'hidden' },
        observation: 'hidden',
      }),
    ]));
    const onEvent = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => {
      result.current.start('run-1', { onEvent });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onEvent).toHaveBeenCalledWith({
      sequence: 1,
      type: 'final',
      status: 'completed',
      text: '公开结论',
    });
  });

  it('cancels the retained response reader and releases its session lifecycle', async () => {
    const cancelReader = vi.fn(async () => undefined);
    const release = vi.fn();
    const bytes = new TextEncoder().encode(
      `data: ${JSON.stringify(event(1, 'final', { status: 'completed' }))}\n\n`,
    );
    let sent = false;
    mockApiStreamFetch.mockImplementation(async (_url, options) => ({
      response: {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn(async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: bytes };
            }),
            cancel: cancelReader,
            releaseLock: vi.fn(),
          }),
        },
      } as unknown as Response,
      signal: options?.signal as AbortSignal,
      release,
    }));
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', { onEvent: vi.fn() }));
    await act(async () => vi.runAllTimersAsync());

    expect(cancelReader).toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not treat a failed tool event as a terminal run event', async () => {
    mockApiStreamFetch.mockResolvedValue(streamResponse([
      event(1, 'tool', { status: 'failed', label: '查询失败' }),
      event(2, 'final', { status: 'completed' }),
    ]));
    const updates: AgentRunPublicEvent[] = [];
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', { onEvent: (item) => updates.push(item) }));
    await act(async () => vi.runAllTimersAsync());

    expect(updates.map((item) => item.sequence)).toEqual([1, 2]);
    expect(updates[0]).not.toHaveProperty('status');
  });

  it('cleans up instead of reconnecting after a nonretryable HTTP response', async () => {
    mockApiStreamFetch.mockResolvedValue(rawStreamResponse('', false));
    const onCleanup = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', { onEvent: vi.fn(), onCleanup }));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(mockApiStreamFetch).toHaveBeenCalledTimes(1);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('cleans up instead of reconnecting after malformed replay data', async () => {
    mockApiStreamFetch.mockResolvedValue(rawStreamResponse('data: not-json\n\n'));
    const onCleanup = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', { onEvent: vi.fn(), onCleanup }));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(mockApiStreamFetch).toHaveBeenCalledTimes(1);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['nonpositive sequence', event(0)],
    ['missing created_at', {
      run_id: 'run-1',
      sequence: 1,
      type: 'progress',
      data: {},
    }],
  ])('cleans up after a malformed envelope with %s', async (_name, malformed) => {
    mockApiStreamFetch.mockResolvedValue(streamResponse([malformed]));
    const onCleanup = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', { onEvent: vi.fn(), onCleanup }));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(mockApiStreamFetch).toHaveBeenCalledTimes(1);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('reconnects after a transient network failure', async () => {
    mockApiStreamFetch
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(streamResponse([event(1, 'final', { status: 'completed' })]));
    const onCleanup = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', { onEvent: vi.fn(), onCleanup }));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(mockApiStreamFetch).toHaveBeenCalledTimes(2);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('reconnects after a retryable server response', async () => {
    mockApiStreamFetch
      .mockResolvedValueOnce({
        ...rawStreamResponse(''),
        response: { ok: false, status: 503, body: null } as unknown as Response,
      })
      .mockResolvedValueOnce(streamResponse([event(1, 'final', { status: 'completed' })]));
    const onCleanup = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', { onEvent: vi.fn(), onCleanup }));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(mockApiStreamFetch).toHaveBeenCalledTimes(2);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('replays the same sequence when the event handler fails', async () => {
    mockApiStreamFetch
      .mockResolvedValueOnce(streamResponse([event(1)]))
      .mockResolvedValueOnce(streamResponse([
        event(1),
        event(2, 'final', { status: 'completed' }),
      ]));
    let failOnce = true;
    const received: number[] = [];
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', {
      onEvent: (item) => {
        if (failOnce) {
          failOnce = false;
          throw new Error('render failed');
        }
        received.push(item.sequence);
      },
    }));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(received).toEqual([1, 2]);
    expect(mockApiStreamFetch).toHaveBeenNthCalledWith(2, '/api/v1/agent-runs/events', expect.objectContaining({
      body: JSON.stringify({ run_id: 'run-1', after_sequence: 0 }),
    }));
  });

  it('treats a terminal status stage as terminal without a status field', async () => {
    mockApiStreamFetch.mockResolvedValue(streamResponse([
      event(1, 'status', { stage: 'completed', label: '研究完成' }),
    ]));
    const onCleanup = vi.fn();
    const { result } = renderHook(() => useAgentRunEvents());

    act(() => result.current.start('run-1', { onEvent: vi.fn(), onCleanup }));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(mockApiStreamFetch).toHaveBeenCalledTimes(1);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });
});
