import { describe, expect, it, vi } from 'vitest';
import { readSseData } from './sse';

function source(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (const chunk of chunks) controller.enqueue(chunk);
    controller.close();
  } });
}

describe('readSseData', () => {
  it('handles byte-split UTF-8, CRLF, comments and multiline data', async () => {
    const bytes = new TextEncoder().encode(': heartbeat\r\nid: r:1:0\r\ndata: {"text":\r\ndata: "中文"}\r\n\r\ndata: next\n\ndata: incomplete');
    const result: string[] = [];
    for await (const data of readSseData(source(Array.from(bytes, (byte) => new Uint8Array([byte]))))) result.push(data);
    expect(result).toEqual(['{"text":\n"中文"}', 'next']);
  });

  it('cancels and releases the reader when a consumer stops at a terminal event', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: terminal\n\ndata: ignored\n\n')); }, cancel,
    });
    for await (const data of readSseData(body)) { expect(data).toBe('terminal'); break; }
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });

  it('unblocks a pending read on abort and releases its reader', async () => {
    const abort = new AbortController();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const iterator = readSseData(body, abort.signal);
    const pending = iterator.next();
    abort.abort();
    expect(await pending).toMatchObject({ done: true });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });

  it('does not consume a pre-aborted request or buffered events after abort', async () => {
    const abort = new AbortController();
    abort.abort();
    const result: string[] = [];
    for await (const data of readSseData(source([new TextEncoder().encode('data: no\n\n')]), abort.signal)) result.push(data);
    expect(result).toEqual([]);
    const nextAbort = new AbortController();
    for await (const data of readSseData(source([new TextEncoder().encode('data: first\n\ndata: second\n\n')]), nextAbort.signal)) {
      result.push(data);
      nextAbort.abort();
    }
    expect(result).toEqual(['first']);
  });
});
