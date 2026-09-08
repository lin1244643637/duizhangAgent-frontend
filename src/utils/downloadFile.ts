import { apiFetch } from '../api/client';

type SaveFileHandle = {
  createWritable: () => Promise<WritableStream<Uint8Array>>;
};

type PickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveFileHandle>;
};

function filenameFromDisposition(disposition: string, fallback: string): string {
  const extended = disposition.match(/(?:^|;)\s*filename\*\s*=\s*(?:"([^"]*)"|([^;]*))/i);
  const extendedValue = (extended?.[1] ?? extended?.[2])?.trim();
  const utf8Value = extendedValue?.match(/^UTF-8'[^']*'(.*)$/i)?.[1];
  if (utf8Value) {
    try {
      return decodeURIComponent(utf8Value);
    } catch {
      // Fall through to the plain filename when the extended value is malformed.
    }
  }

  const plain = disposition.match(/(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]*))/i);
  return (plain?.[1]?.replace(/\\(.)/g, '$1') ?? plain?.[2]?.trim()) || fallback;
}

export async function downloadFile(href: string, fallbackFilename: string): Promise<void> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  const handle = picker
    ? await picker.call(window, { suggestedName: fallbackFilename })
    : null;
  const response = await apiFetch(href);
  if (!response.ok) throw new Error('下载失败，请稍后重试');

  if (handle) {
    if (!response.body) throw new Error('下载响应不支持流式读取');
    const writable = await handle.createWritable();
    await response.body.pipeTo(writable);
    return;
  }

  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  try {
    link.href = blobUrl;
    link.download = filenameFromDisposition(
      response.headers.get('Content-Disposition') || '',
      fallbackFilename,
    );
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(blobUrl);
  }
}
