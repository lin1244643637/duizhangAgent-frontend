import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const decisionApi = vi.hoisted(() => ({
  getEnterpriseProfile: vi.fn(),
  getEnterpriseProfileHistory: vi.fn(),
  saveEnterpriseProfile: vi.fn(),
}));
const noticeApi = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../../api/analyticsDecision', () => decisionApi);
vi.mock('../../utils/time', () => ({ currentBeijingDate: () => '2026-08-06' }));
vi.mock('antd', async (importOriginal) => {
  const antd = await importOriginal<typeof import('antd')>();
  return {
    ...antd,
    DatePicker: ({ value, maxDate, onChange, ...props }: { value?: dayjs.Dayjs | null; maxDate?: dayjs.Dayjs; onChange?: (next: dayjs.Dayjs | null) => void; 'aria-label'?: string }) => (
      <input
        aria-label={props['aria-label']}
        max={maxDate?.format('YYYY-MM-DD')}
        value={value?.format('YYYY-MM-DD') || ''}
        onChange={(event) => {
          const next = event.target.value ? dayjs(event.target.value) : null;
          if (!next || !maxDate || !next.isAfter(maxDate, 'day')) onChange?.(next);
        }}
      />
    ),
    notification: { ...antd.notification, useNotification: () => [noticeApi, null] },
  };
});

import { EnterpriseProfilePanel } from './EnterpriseProfilePanel';

const activeProfile = {
  id: 'profile-2',
  profile_version: 2,
  status: 'active' as const,
  effective_from: '2026-08-06',
  scope: { type: 'company' as const, key: 'ALL' },
  brand_positioning: '社区中式快餐',
  core_customers: ['家庭客群'],
  price_band: '20-40元',
  core_products: ['肉夹馍'],
  operating_constraints: ['晚高峰产能有限'],
  review_red_lines: ['食品安全'],
  created_by: 'admin',
  created_at: '2026-08-06T20:00:00+08:00',
  updated_at: '2026-08-06T20:00:00+08:00',
};

beforeEach(() => {
  vi.clearAllMocks();
  decisionApi.getEnterpriseProfile.mockResolvedValue(activeProfile);
  decisionApi.getEnterpriseProfileHistory.mockResolvedValue([
    activeProfile,
    { ...activeProfile, id: 'profile-1', profile_version: 1, status: 'superseded' },
  ]);
  decisionApi.saveEnterpriseProfile.mockResolvedValue({ ...activeProfile, profile_version: 3 });
});

afterEach(() => cleanup());

describe('EnterpriseProfilePanel', () => {
  it('loads the active version and keeps array fields controlled through save', async () => {
    render(<EnterpriseProfilePanel />);

    expect(await screen.findByText('当前版本 v2')).toBeTruthy();
    const customer = screen.getByLabelText('核心客群 1') as HTMLInputElement;
    fireEvent.change(customer, { target: { value: '通勤客群' } });
    expect(customer.value).toBe('通勤客群');
    fireEvent.click(screen.getByRole('button', { name: '新增核心客群' }));
    fireEvent.change(screen.getByLabelText('核心客群 2'), { target: { value: '亲子客群' } });
    fireEvent.click(screen.getByRole('button', { name: '删除核心客群 1' }));
    const effectiveDate = screen.getByLabelText('企业画像生效日') as HTMLInputElement;
    expect(effectiveDate.max).toBe('2026-08-06');
    fireEvent.change(effectiveDate, { target: { value: '2026-08-05' } });
    fireEvent.click(screen.getByRole('button', { name: '保存企业画像' }));

    await waitFor(() => expect(decisionApi.saveEnterpriseProfile).toHaveBeenCalledWith(expect.objectContaining({
      effective_from: '2026-08-05',
      scope: { type: 'company', key: 'ALL' },
      core_customers: ['亲子客群'],
      core_products: ['肉夹馍'],
      operating_constraints: ['晚高峰产能有限'],
      review_red_lines: ['食品安全'],
    })));
    expect(noticeApi.success).toHaveBeenCalledWith(expect.objectContaining({ duration: 5, closable: true }));
  });

  it('shows bounded version history', async () => {
    render(<EnterpriseProfilePanel />);

    expect(await screen.findByText('v2')).toBeTruthy();
    expect(screen.getByText('v1')).toBeTruthy();
    expect(screen.getByText('已替代')).toBeTruthy();
  });

  it('uses a permission notice when a member cannot save', async () => {
    decisionApi.saveEnterpriseProfile.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
    render(<EnterpriseProfilePanel />);
    await screen.findByText('当前版本 v2');

    fireEvent.click(screen.getByRole('button', { name: '保存企业画像' }));

    await waitFor(() => expect(noticeApi.error).toHaveBeenCalledWith(expect.objectContaining({
      message: '无权限保存', duration: 5, closable: true,
    })));
  });

  it('keeps a successful save successful when history refresh fails', async () => {
    decisionApi.getEnterpriseProfileHistory
      .mockResolvedValueOnce([activeProfile])
      .mockRejectedValueOnce(new Error('history unavailable'));
    render(<EnterpriseProfilePanel />);
    await screen.findByText('当前版本 v2');

    fireEvent.click(screen.getByRole('button', { name: '保存企业画像' }));

    await waitFor(() => expect(noticeApi.success).toHaveBeenCalled());
    expect(noticeApi.error).toHaveBeenCalledWith(expect.objectContaining({
      message: '刷新画像历史失败', duration: 5, closable: true,
    }));
    expect(noticeApi.error).not.toHaveBeenCalledWith(expect.objectContaining({ message: '保存企业画像失败' }));
  });
});
