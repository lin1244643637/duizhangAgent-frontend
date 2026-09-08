// @ts-ignore app tsconfig intentionally does not include Node globals; this test runs in Vitest.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');

describe('global button hover border guard', () => {
  it('uses border-box globally', () => {
    expect(css).toContain('*::before');
    expect(css).toContain('*::after');
    expect(css).toContain('box-sizing: border-box');
  });

  it('keeps button border styling stable across interactive states', () => {
    expect(css).toContain('button:hover');
    expect(css).toContain('.ant-btn:hover');
    expect(css).toContain('border-color: var(--button-hover-border-color)');
    expect(css).not.toContain('border-style: inherit !important');
    expect(css).not.toContain('border-width: inherit !important');
  });
});
