import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from './usePolling';

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDocumentHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('按间隔触发回调，卸载后停止', async () => {
    const tick = vi.fn();
    const { unmount } = renderHook(() => usePolling(tick, 1000));

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(tick).toHaveBeenCalledTimes(3);

    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(tick).toHaveBeenCalledTimes(3); // 卸载后不再触发
  });

  it('页面隐藏暂停，回到前台立即补一次并恢复', async () => {
    const tick = vi.fn();
    renderHook(() => usePolling(tick, 1000));

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(tick).toHaveBeenCalledTimes(1);

    act(() => setDocumentHidden(true));
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(tick).toHaveBeenCalledTimes(1); // 隐藏期间不轮询

    act(() => setDocumentHidden(false));
    expect(tick).toHaveBeenCalledTimes(2); // 回前台立即补一次
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(tick).toHaveBeenCalledTimes(4); // 恢复节奏
  });

  it('intervalMs 为 null 时不轮询', () => {
    const tick = vi.fn();
    renderHook(() => usePolling(tick, null));
    act(() => vi.advanceTimersByTime(10000));
    expect(tick).not.toHaveBeenCalled();
  });

  it('回调始终用最新闭包(重渲染不重置定时器)', async () => {
    const calls: string[] = [];
    const { rerender } = renderHook(({ label }) => usePolling(() => calls.push(label), 1000), {
      initialProps: { label: 'a' },
    });

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    rerender({ label: 'b' });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(calls).toEqual(['a', 'b']);
  });

  it('deps 变化重启轮询', async () => {
    const tick = vi.fn();
    const { rerender } = renderHook(({ dep }) => usePolling(tick, 1000, [dep]), {
      initialProps: { dep: 1 },
    });

    await act(async () => vi.advanceTimersByTimeAsync(500));
    rerender({ dep: 2 }); // 重启：计时从零开始
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(tick).toHaveBeenCalledTimes(0);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('等待异步回调完成后再安排下一次轮询', async () => {
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const tick = vi.fn().mockImplementationOnce(() => first).mockResolvedValue(undefined);
    renderHook(() => usePolling(tick, 1000));

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(tick).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst();
      await first;
    });
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(tick).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('隐藏时中止在途回调且晚到结果不得写入', async () => {
    let resolveRequest!: () => void;
    let signal: AbortSignal | undefined;
    const request = new Promise<void>((resolve) => { resolveRequest = resolve; });
    const lateWrite = vi.fn();
    const tick = vi.fn(async (currentSignal: AbortSignal) => {
      signal = currentSignal;
      await request;
      if (!currentSignal.aborted) lateWrite();
    });
    renderHook(() => usePolling(tick, 1000));

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    act(() => setDocumentHidden(true));
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      resolveRequest();
      await request;
    });
    expect(lateWrite).not.toHaveBeenCalled();
  });

  it('卸载时中止在途回调', async () => {
    let signal: AbortSignal | undefined;
    const tick = vi.fn((currentSignal: AbortSignal) => {
      signal = currentSignal;
      return new Promise<void>(() => undefined);
    });
    const { unmount } = renderHook(() => usePolling(tick, 1000));

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('intervalMs 变为 null 时按终态清理在途回调', async () => {
    let signal: AbortSignal | undefined;
    const tick = vi.fn((currentSignal: AbortSignal) => {
      signal = currentSignal;
      return new Promise<void>(() => undefined);
    });
    const { rerender } = renderHook(({ interval }) => usePolling(tick, interval), {
      initialProps: { interval: 1000 as number | null },
    });

    await act(async () => vi.advanceTimersByTimeAsync(1000));
    rerender({ interval: null });

    expect(signal?.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(tick).toHaveBeenCalledTimes(1);
  });
});
