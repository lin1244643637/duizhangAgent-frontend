import { describe, expect, it } from 'vitest';
import { isStoreComparison, normalizeStoreSelection, selectedStoreKeys } from './storeSelection';

describe('store selection', () => {
  it('keeps ALL mutually exclusive with concrete stores', () => {
    expect(normalizeStoreSelection(['ALL'], ['ALL', '101'])).toEqual(['101']);
    expect(normalizeStoreSelection(['101'], ['101', 'ALL'])).toEqual(['ALL']);
  });

  it('falls back to ALL and removes duplicate stores', () => {
    expect(normalizeStoreSelection(['101'], [])).toEqual(['ALL']);
    expect(normalizeStoreSelection(['ALL'], ['102', '101', '102'])).toEqual(['102', '101']);
  });

  it('detects multi-store comparison mode', () => {
    expect(selectedStoreKeys(['ALL'])).toEqual([]);
    expect(isStoreComparison(['101'])).toBe(false);
    expect(isStoreComparison(['101', '102'])).toBe(true);
  });
});
