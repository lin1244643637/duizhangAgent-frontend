export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const cancel = () => { void reader.cancel?.().catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  let skipLf = false;

  if (signal?.aborted) cancel();

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) break;
      // 按行解析，允许 CRLF、UTF-8 字符与事件跨网络 chunk；多行 data 用换行连接。
      for (const char of decoder.decode(value, { stream: true })) {
        if (skipLf && char === '\n') { skipLf = false; continue; }
        skipLf = char === '\r';
        if (char !== '\r' && char !== '\n') { buffer += char; continue; }
        const line = buffer;
        buffer = '';
        if (line === '') {
          if (data.length) {
            const raw = data.join('\n');
            data = [];
            if (signal?.aborted) return;
            yield raw;
          }
        } else if (line === 'data' || line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        }
      }
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel?.().catch(() => undefined);
    reader.releaseLock?.();
  }
}
