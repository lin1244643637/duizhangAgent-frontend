/** PreferencesPanel（个人中心偏好）测试：加载显示 / 保存显性 / 清除。 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getMyPreferences = vi.fn();
const updateMyPreferences = vi.fn();
const clearMyPreferences = vi.fn();

vi.mock('../api/preferences', () => ({
  getMyPreferences: (...a: unknown[]) => getMyPreferences(...a),
  updateMyPreferences: (...a: unknown[]) => updateMyPreferences(...a),
  clearMyPreferences: (...a: unknown[]) => clearMyPreferences(...a),
}));

import { PreferencesPanel } from './PreferencesPanel';

describe('PreferencesPanel', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('加载后回填显性设置并展示频次常用项', async () => {
    getMyPreferences.mockResolvedValue({ explicit: { scope: '直营店' }, store: { 唐城店: 3 } });
    render(<PreferencesPanel />);
    await waitFor(() => expect(screen.getByDisplayValue('直营店')).toBeTruthy());
    expect(screen.getByText(/常查门店：唐城店/)).toBeTruthy();
  });

  it('保存显性偏好只提交已填字段', async () => {
    getMyPreferences.mockResolvedValue({});
    updateMyPreferences.mockResolvedValue({ explicit: { scope: '直营店' } });
    render(<PreferencesPanel />);
    await waitFor(() => expect(screen.getByText('保存偏好')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('如：直营店'), { target: { value: '直营店' } });
    fireEvent.click(screen.getByText('保存偏好'));
    await waitFor(() => expect(updateMyPreferences).toHaveBeenCalledWith({ scope: '直营店' }));
  });

  it('保存下拉偏好', async () => {
    getMyPreferences.mockResolvedValue({});
    updateMyPreferences.mockResolvedValue({ explicit: { granularity: '月度', download_format: 'xlsx' } });
    render(<PreferencesPanel />);
    await waitFor(() => expect(screen.getByText('保存偏好')).toBeTruthy());

    const selects = screen.getAllByRole('combobox');
    fireEvent.mouseDown(selects[0]);
    fireEvent.click(await screen.findByTitle('月度'));
    fireEvent.mouseDown(selects[1]);
    fireEvent.click(await screen.findByTitle('Excel (xlsx)'));
    fireEvent.click(screen.getByText('保存偏好'));

    await waitFor(() => expect(updateMyPreferences).toHaveBeenCalledWith({ granularity: '月度', download_format: 'xlsx' }));
  });

  it('清除全部偏好', async () => {
    getMyPreferences.mockResolvedValue({ explicit: { scope: '直营店' } });
    clearMyPreferences.mockResolvedValue(true);
    render(<PreferencesPanel />);
    await waitFor(() => expect(screen.getByText('清除全部偏好')).toBeTruthy());
    fireEvent.click(screen.getByText('清除全部偏好'));
    await waitFor(() => expect(clearMyPreferences).toHaveBeenCalled());
  });
});
