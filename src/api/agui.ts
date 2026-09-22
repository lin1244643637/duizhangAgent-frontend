import { apiStreamFetch } from './client';
import { readSseData } from './sse';
import { aguiRecord, type AguiEvent, type AguiRunInput } from '../types/agui';

export async function* streamAguiRun(
  input: AguiRunInput,
  signal: AbortSignal,
  lastEventId?: string,
): AsyncGenerator<AguiEvent> {
  const stream = await apiStreamFetch('/api/v1/agui/runs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
    },
    body: JSON.stringify(input),
    signal,
  });
  try {
    const { response } = stream;
    if (!response.ok) throw new Error(`新对话接口返回 HTTP ${response.status}，请确认后端已启用新架构。`);
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      throw new Error('新对话接口未返回事件流，请确认接口已同步。');
    }
    for await (const raw of readSseData(response.body, stream.signal)) {
      if (stream.signal.aborted) break;
      let event: Record<string, unknown> | null;
      try { event = aguiRecord(JSON.parse(raw)); } catch { event = null; }
      const cursor = typeof event?.eventId === 'string' ? event.eventId.split(':') : [];
      if (!event || typeof event.type !== 'string'
        || event.runId !== input.runId || event.threadId !== input.threadId
        || !Number.isSafeInteger(event.sequence) || Number(event.sequence) < 0
        || cursor.length !== 3 || cursor[0] !== input.runId
        || cursor[1] !== String(event.sequence) || !/^\d+$/.test(cursor[2])
        || !Number.isSafeInteger(Number(cursor[2]))) {
        throw new Error('收到无法识别的新对话事件，已暂停接收。');
      }
      yield event as AguiEvent;
      if (event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR') break;
    }
  } finally {
    if (stream.response.body && !stream.response.body.locked) await stream.response.body.cancel().catch(() => undefined);
    stream.release();
  }
}
