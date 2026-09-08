import { useEffect, useRef } from 'react';

/**
 * 通用轮询 hook：组件卸载自动清理；页面切到后台(document.hidden)自动暂停，
 * 回到前台立即补一次并恢复节奏——避免不可见标签页空打接口。
 *
 * @param callback 每个周期执行的函数，接收本轮 AbortSignal(组件重渲染不重置定时器)
 * @param intervalMs 轮询间隔毫秒；传 null/0 表示停用
 * @param deps 变化时重启轮询的依赖(等价于原 useEffect 依赖)
 */
export function usePolling(
  callback: (signal: AbortSignal) => unknown | Promise<unknown>,
  intervalMs: number | null,
  deps: unknown[] = [],
): void {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (!intervalMs) return;
    let timer: number | null = null;
    let inflight: AbortController | null = null;
    let active = true;
    let rerunWhenReady = false;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const schedule = () => {
      if (!active || document.hidden || inflight || timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        void tick();
      }, intervalMs);
    };
    const tick = async () => {
      if (!active || document.hidden) return;
      if (inflight) {
        rerunWhenReady = true;
        return;
      }

      const controller = new AbortController();
      inflight = controller;
      try {
        await savedCallback.current(controller.signal);
      } catch {
        // 单次失败由调用方反馈；轮询保持后续重试能力。
      } finally {
        if (inflight === controller) inflight = null;
        if (!active || document.hidden) return;
        if (rerunWhenReady) {
          rerunWhenReady = false;
          void tick();
        } else {
          schedule();
        }
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        clearTimer();
        rerunWhenReady = false;
        inflight?.abort();
      } else {
        clearTimer();
        if (inflight) rerunWhenReady = true;
        else void tick();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) schedule();
    return () => {
      active = false;
      rerunWhenReady = false;
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimer();
      inflight?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
