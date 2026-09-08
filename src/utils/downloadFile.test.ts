import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '../api/client';
import { downloadFile } from './downloadFile';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}));

type SaveFileHandle = {
  createWritable: () => Promise<WritableStream<Uint8Array>>;
};

type PickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveFileHandle>;
};

const pickerWindow = window as PickerWindow;
const originalPicker = pickerWindow.showSaveFilePicker;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe('downloadFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete pickerWindow.showSaveFilePicker;
  });

  afterEach(() => {
    if (originalPicker) {
      pickerWindow.showSaveFilePicker = originalPicker;
    } else {
      delete pickerWindow.showSaveFilePicker;
    }
    vi.restoreAllMocks();
    if (originalCreateObjectURL) {
      URL.createObjectURL = originalCreateObjectURL;
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL');
    }
    if (originalRevokeObjectURL) {
      URL.revokeObjectURL = originalRevokeObjectURL;
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('opens the file picker before the authenticated request and streams the response body', async () => {
    const order: string[] = [];
    const writable = new WritableStream<Uint8Array>();
    const createWritable = vi.fn().mockResolvedValue(writable);
    pickerWindow.showSaveFilePicker = vi.fn(async () => {
      order.push('picker');
      return { createWritable };
    });

    const response = new Response('excel data');
    const pipeTo = vi.spyOn(response.body!, 'pipeTo').mockResolvedValue(undefined);
    const readAsBlob = vi.spyOn(response, 'blob');
    vi.mocked(apiFetch).mockImplementation(async () => {
      order.push('fetch');
      return response;
    });

    await downloadFile('/api/v1/reports/download/1', '财务报表.xlsx');

    expect(order).toEqual(['picker', 'fetch']);
    expect(pickerWindow.showSaveFilePicker).toHaveBeenCalledWith({ suggestedName: '财务报表.xlsx' });
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/reports/download/1');
    expect(createWritable).toHaveBeenCalledOnce();
    expect(pipeTo).toHaveBeenCalledWith(writable);
    expect(readAsBlob).not.toHaveBeenCalled();
  });

  it('uses a UTF-8 Content-Disposition filename and revokes the Blob URL fallback', async () => {
    const events: string[] = [];
    const response = new Response('excel data', {
      headers: {
        'Content-Disposition': "attachment; filename=report.xlsx; filename*=UTF-8'zh-CN'%E8%B4%A2%E5%8A%A1%E6%8A%A5%E8%A1%A8%208%E6%9C%88.xlsx",
      },
    });
    vi.mocked(apiFetch).mockResolvedValue(response);
    URL.createObjectURL = vi.fn(() => 'blob:report');
    URL.revokeObjectURL = vi.fn((url) => {
      events.push(`revoke:${url}`);
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      events.push(`click:${this.download}`);
    });

    await downloadFile('/api/v1/reports/download/1', 'fallback.xlsx');

    expect(events).toEqual([
      'click:财务报表 8月.xlsx',
      'revoke:blob:report',
    ]);
  });
});
