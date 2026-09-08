type SessionCleanup = () => void;
type SessionUnauthorizedHandler = (token: string) => void;

const cleanups = new Set<SessionCleanup>();
const activeControllers = new Set<AbortController>();
let generation = 0;
let unauthorizedHandler: SessionUnauthorizedHandler | null = null;

export function registerSessionCleanup(cleanup: SessionCleanup): () => void {
  cleanups.add(cleanup);
  return () => cleanups.delete(cleanup);
}

export function registerSessionUnauthorizedHandler(handler: SessionUnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

export function reportSessionUnauthorized(token: string): void {
  unauthorizedHandler?.(token);
}

export function beginSessionRequest(parentSignal?: AbortSignal | null) {
  const controller = new AbortController();
  const requestGeneration = generation;
  const abortFromParent = () => controller.abort();

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }
  activeControllers.add(controller);

  return {
    signal: controller.signal,
    isCurrent: () => generation === requestGeneration && !controller.signal.aborted,
    release: () => {
      activeControllers.delete(controller);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

export function invalidateSessionRequests(): void {
  generation += 1;
  for (const controller of activeControllers) controller.abort();
  activeControllers.clear();
}

export function clearSessionState(): void {
  invalidateSessionRequests();
  for (const cleanup of cleanups) cleanup();
}
