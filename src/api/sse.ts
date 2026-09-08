export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const cancel = () => { void reader.cancel?.().catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.split('\n').find((item) => item.startsWith('data:'));
        const raw = line?.slice(5).replace(/^ /, '');
        if (raw) yield raw;
      }
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel?.().catch(() => undefined);
    reader.releaseLock?.();
  }
}
