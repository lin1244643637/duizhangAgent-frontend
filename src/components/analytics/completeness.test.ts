import { describe, expect, it } from 'vitest';
import { completenessIsReady, completenessStatus, normalizeDataStatus } from './completeness';

describe('analytics completeness helpers', () => {
  it('prefers canonical server status over legacy data_status', () => {
    expect(completenessStatus({ status: 'partial', data_status: 'ready' }, 'missing')).toBe('partial');
  });

  it('normalizes legacy status names used by older responses', () => {
    expect(normalizeDataStatus('ok')).toBe('ready');
    expect(normalizeDataStatus('incomplete')).toBe('partial');
    expect(normalizeDataStatus('unexpected')).toBe('missing');
  });

  it('uses the explicit complete flag when provided', () => {
    expect(completenessIsReady({ complete: false }, 'ready')).toBe(false);
    expect(completenessIsReady({}, 'ok')).toBe(true);
  });
});
