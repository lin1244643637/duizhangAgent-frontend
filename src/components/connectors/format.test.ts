import { describe, expect, it } from 'vitest';

import type { ConnectorSyncRun } from '../../api/connectors';
import { formatSyncRange } from './format';

function run(overrides: Partial<ConnectorSyncRun>): ConnectorSyncRun {
  return {
    id: 'r1',
    provider: 'dingtalk',
    data_source_id: 'ds1',
    status: 'success',
    date_from: null,
    date_to: null,
    total_count: 0,
    success_count: 0,
    failed_count: 0,
    error_message: null,
    trigger_source: 'manual',
    created_at: '2026-06-30T08:00:00.000Z',
    started_at: null,
    finished_at: null,
    ...overrides,
  };
}

describe('connector format helpers', () => {
  it('formats sync request window as Beijing time instead of raw ISO', () => {
    const text = formatSyncRange(run({
      request_params_override: {
        sync_start_datetime: '2026-06-30T08:04:16.000Z',
        sync_end_datetime: '2026-06-30T09:04:16.000Z',
      },
    }));

    expect(text).toContain('2026/06/30 16:04:16');
    expect(text).toContain('2026/06/30 17:04:16');
    expect(text).not.toContain('.000Z');
  });
});
