import { describe, expect, it } from 'vitest';

import { currentBeijingPeriod } from './time';

describe('currentBeijingPeriod', () => {
  it('uses July in Beijing during the UTC June boundary', () => {
    expect(currentBeijingPeriod(new Date('2026-06-30T16:30:00Z'))).toBe('2026-07');
  });
});
