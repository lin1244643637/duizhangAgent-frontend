import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('./admin/adminStore', () => ({
  isPlatformHash: () => true,
}));

vi.mock('./admin/AdminApp', () => ({
  AdminApp: () => <div>平台后台</div>,
}));

import App from './App';

describe('App document scrolling', () => {
  const originalRootOverflow = document.documentElement.style.overflow;
  const originalBodyOverflow = document.body.style.overflow;

  beforeEach(() => {
    document.documentElement.style.overflow = 'visible';
    document.body.style.overflow = 'scroll';
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.documentElement.style.overflow = originalRootOverflow;
    document.body.style.overflow = originalBodyOverflow;
    vi.restoreAllMocks();
  });

  it('keeps document scrolling locked while the app is mounted', () => {
    const { unmount } = render(<App />);

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });

    unmount();

    expect(document.documentElement.style.overflow).toBe('visible');
    expect(document.body.style.overflow).toBe('scroll');
  });
});
