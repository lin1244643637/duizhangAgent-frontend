// @ts-ignore app tsconfig intentionally does not include Node globals; this test runs in Vitest.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync('src/main.tsx', 'utf8');
const nginx = readFileSync('nginx.conf', 'utf8');

describe('frontend deployment recovery', () => {
  it('reloads an open page when a deployed lazy chunk no longer exists', () => {
    expect(main).toContain("window.addEventListener('vite:preloadError'");
    expect(main).toContain('event.preventDefault()');
    expect(main).toContain('window.location.reload()');
  });

  it('revalidates static assets so a reload does not reuse a stale entry bundle', () => {
    expect(nginx.match(/Cache-Control "public, no-cache"/g)).toHaveLength(2);
  });
});
