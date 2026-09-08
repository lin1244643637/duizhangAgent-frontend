import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analyticsApi = vi.hoisted(() => ({
  confirmGeoProfile: vi.fn(),
  confirmShopMapping: vi.fn(),
  geocodeStore: vi.fn(),
  getRevenueForecastModel: vi.fn(),
  getStoreWeather: vi.fn(),
  getTradeArea: vi.fn(),
  listHrDepartments: vi.fn(),
  listPlatformDim: vi.fn(),
  listStoreGeoProfiles: vi.fn(),
  listTradeAreaPois: vi.fn(),
  listShopMappings: vi.fn(),
  listStoreScopeTree: vi.fn(),
  optimizeRevenueForecastModel: vi.fn(),
  proposeShopMappings: vi.fn(),
  refreshTradeArea: vi.fn(),
  savePlatformName: vi.fn(),
  saveStoreFacilityProfile: vi.fn(),
}));
const decisionApi = vi.hoisted(() => ({
  getProfitLineVersions: vi.fn(),
  getStaffingRuleVersions: vi.fn(),
  saveProfitLine: vi.fn(),
  saveStaffingRule: vi.fn(),
}));
const noticeApi = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../../api/analytics', () => analyticsApi);
vi.mock('../../api/analyticsDecision', () => decisionApi);
vi.mock('antd', async (importOriginal) => {
  const antd = await importOriginal<typeof import('antd')>();
  return {
    ...antd,
    DatePicker: ({ value, onChange, ...props }: { value?: dayjs.Dayjs | null; onChange?: (next: dayjs.Dayjs | null) => void; 'aria-label'?: string }) => (
      <input
        aria-label={props['aria-label']}
        value={value?.format('YYYY-MM-DD') || ''}
        onChange={(event) => onChange?.(event.target.value ? dayjs(event.target.value) : null)}
      />
    ),
    InputNumber: ({ value, onChange, ...props }: { value?: string | number | null; onChange?: (next: string | null) => void; 'aria-label'?: string }) => (
      <input
        aria-label={props['aria-label']}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value || null)}
      />
    ),
    notification: { ...antd.notification, useNotification: () => [noticeApi, null] },
  };
});

import { DecisionSettingsPanel } from './DecisionSettingsPanel';
import { SettingsSection } from './SettingsSection';
import { currentBeijingDate } from '../../utils/time';

const storeTree = {
  nodes: [{
    key: 'north',
    type: 'group' as const,
    label: '北区',
    children: [{ key: 'store-1', type: 'store' as const, label: '海景店', store_key: 'store-1' }],
  }],
  store_count: 1,
  source: 'tree',
};

const profitLineVersions = {
  current: {
    id: 'profit-1', store_key: 'store-1', effective_date: '2026-08-01', net_income_line: '1000.10',
    enabled: true, reason: '', created_by: 'admin', created_at: '2026-08-01T09:00:00+08:00',
  },
  next: null,
  versions: [{
    id: 'profit-1', store_key: 'store-1', effective_date: '2026-08-01', net_income_line: '1000.10',
    enabled: true, reason: '', created_by: 'admin', created_at: '2026-08-01T09:00:00+08:00',
  }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  analyticsApi.listStoreScopeTree.mockResolvedValue(storeTree);
  analyticsApi.getRevenueForecastModel.mockResolvedValue(null);
  analyticsApi.listStoreGeoProfiles.mockResolvedValue([]);
  analyticsApi.listShopMappings.mockResolvedValue([]);
  analyticsApi.listHrDepartments.mockResolvedValue([]);
  analyticsApi.listPlatformDim.mockResolvedValue([]);
  decisionApi.getProfitLineVersions.mockResolvedValue(profitLineVersions);
  decisionApi.getStaffingRuleVersions.mockResolvedValue({ current: [], versions: [] });
  decisionApi.saveProfitLine.mockResolvedValue(profitLineVersions.current);
  decisionApi.saveStaffingRule.mockResolvedValue({});
});

afterEach(() => cleanup());

async function renderPanel({ expandProfitLine = false } = {}) {
  render(<DecisionSettingsPanel />);
  await screen.findByText('海景店');
  await waitFor(() => expect(decisionApi.getProfitLineVersions).toHaveBeenCalledWith('store-1'));
  if (expandProfitLine) {
    fireEvent.click(screen.getByText('盈利线'));
    await screen.findByLabelText('盈利线金额');
  }
}

describe('DecisionSettingsPanel', () => {
  it('keeps decision rule forms collapsed until an operator opens a panel', async () => {
    await renderPanel();

    expect(screen.queryByLabelText('盈利线金额')).toBeNull();
    expect(screen.queryByLabelText('岗位编码')).toBeNull();

    fireEvent.click(screen.getByText('盈利线'));

    expect(await screen.findByLabelText('盈利线金额')).toBeTruthy();
  });

  it('loads actual stores from the shared store scope tree', async () => {
    await renderPanel();

    expect(analyticsApi.listStoreScopeTree).toHaveBeenCalledTimes(1);
    expect(screen.getByText('海景店')).toBeTruthy();
  });

  it('keeps the profit-line effective date controlled', async () => {
    await renderPanel({ expandProfitLine: true });

    const dateInput = screen.getByLabelText('盈利线生效日') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-09-01' } });

    expect(dateInput.value).toBe('2026-09-01');
  });

  it('submits the profit-line amount as an unchanged string', async () => {
    await renderPanel({ expandProfitLine: true });
    fireEvent.change(screen.getByLabelText('盈利线金额'), { target: { value: '1234.50' } });
    fireEvent.click(screen.getByRole('button', { name: '保存盈利线' }));

    await waitFor(() => expect(decisionApi.saveProfitLine).toHaveBeenCalledWith({
      store_key: 'store-1', effective_date: currentBeijingDate(), net_income_line: '1234.50', enabled: true, reason: '',
    }));
  });

  it('refreshes the profit-line history after saving', async () => {
    await renderPanel({ expandProfitLine: true });
    fireEvent.change(screen.getByLabelText('盈利线金额'), { target: { value: '1234.50' } });
    fireEvent.click(screen.getByRole('button', { name: '保存盈利线' }));

    await waitFor(() => expect(decisionApi.getProfitLineVersions).toHaveBeenCalledTimes(2));
  });

  it('notifies clearly when a save conflicts with an existing effective date', async () => {
    decisionApi.saveProfitLine.mockRejectedValueOnce(Object.assign(new Error('profit_line_effective_date_conflict'), { status: 409 }));
    await renderPanel({ expandProfitLine: true });
    fireEvent.change(screen.getByLabelText('盈利线金额'), { target: { value: '1234.50' } });
    fireEvent.click(screen.getByRole('button', { name: '保存盈利线' }));

    await waitFor(() => expect(noticeApi.error).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining('新的生效日'), duration: 5, closable: true,
    })));
  });

  it('uses the permission notice when the shared client expires the session', async () => {
    decisionApi.saveProfitLine.mockRejectedValueOnce(new Error('登录已过期，请重新登录'));
    await renderPanel({ expandProfitLine: true });
    fireEvent.change(screen.getByLabelText('盈利线金额'), { target: { value: '1234.50' } });
    fireEvent.click(screen.getByRole('button', { name: '保存盈利线' }));

    await waitFor(() => expect(noticeApi.error).toHaveBeenCalledWith(expect.objectContaining({
      message: '无权限保存', duration: 5, closable: true,
    })));
  });

  it('shows a completed empty state when the tenant has no configurable stores', async () => {
    analyticsApi.listStoreScopeTree.mockResolvedValue({ nodes: [], store_count: 0, source: 'tree' });
    render(<DecisionSettingsPanel />);

    expect(await screen.findByText('暂无可配置门店')).toBeTruthy();
    expect(decisionApi.getProfitLineVersions).not.toHaveBeenCalled();
  });

  it('keeps the latest store response when an older request resolves last', async () => {
    const firstProfit = deferred<typeof profitLineVersions>();
    const firstStaffing = deferred<{ current: never[]; versions: never[] }>();
    analyticsApi.listStoreScopeTree.mockResolvedValue({
      ...storeTree,
      nodes: [{
        ...storeTree.nodes[0],
        children: [
          ...storeTree.nodes[0].children,
          { key: 'store-2', type: 'store' as const, label: '城南店', store_key: 'store-2' },
        ],
      }],
      store_count: 2,
    });
    decisionApi.getProfitLineVersions.mockImplementation((key: string) => key === 'store-1'
      ? firstProfit.promise
      : Promise.resolve({
        current: { ...profitLineVersions.current, id: 'profit-2', store_key: 'store-2', net_income_line: '2000.20' },
        next: null,
        versions: [],
      }));
    decisionApi.getStaffingRuleVersions.mockImplementation((key: string) => key === 'store-1'
      ? firstStaffing.promise
      : Promise.resolve({ current: [], versions: [] }));

    await renderPanel({ expandProfitLine: true });
    const picker = await screen.findByLabelText('经营决策门店');
    fireEvent.mouseDown(picker);
    fireEvent.click(await screen.findByText('城南店'));
    expect(await screen.findByText('2000.20')).toBeTruthy();

    firstProfit.resolve(profitLineVersions);
    firstStaffing.resolve({ current: [], versions: [] });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('2000.20')).toBeTruthy();
    expect(screen.queryByText('1000.10')).toBeNull();
  });

  it('blocks both saves until the newly selected store history is loaded', async () => {
    const secondProfit = deferred<typeof profitLineVersions>();
    const secondStaffing = deferred<{ current: never[]; versions: never[] }>();
    analyticsApi.listStoreScopeTree.mockResolvedValue({
      ...storeTree,
      nodes: [{
        ...storeTree.nodes[0],
        children: [
          ...storeTree.nodes[0].children,
          { key: 'store-2', type: 'store' as const, label: '城南店', store_key: 'store-2' },
        ],
      }],
      store_count: 2,
    });
    decisionApi.getProfitLineVersions.mockImplementation((key: string) => key === 'store-2'
      ? secondProfit.promise
      : Promise.resolve(profitLineVersions));
    decisionApi.getStaffingRuleVersions.mockImplementation((key: string) => key === 'store-2'
      ? secondStaffing.promise
      : Promise.resolve({ current: [], versions: [] }));

    await renderPanel({ expandProfitLine: true });
    fireEvent.change(screen.getByLabelText('盈利线金额'), { target: { value: '1234.50' } });
    fireEvent.click(screen.getByText('排班规则'));
    fireEvent.change(await screen.findByLabelText('岗位编码'), { target: { value: 'cashier' } });
    fireEvent.change(screen.getByLabelText('人效值'), { target: { value: '500.00' } });

    fireEvent.mouseDown(screen.getByLabelText('经营决策门店'));
    fireEvent.click(await screen.findByText('城南店'));

    const profitButton = screen.getByRole('button', { name: '保存盈利线' }) as HTMLButtonElement;
    const staffingButton = screen.getByRole('button', { name: '保存排班规则' }) as HTMLButtonElement;
    expect(profitButton.disabled).toBe(true);
    expect(staffingButton.disabled).toBe(true);
    fireEvent.click(profitButton);
    fireEvent.click(staffingButton);
    expect(decisionApi.saveProfitLine).not.toHaveBeenCalled();
    expect(decisionApi.saveStaffingRule).not.toHaveBeenCalled();

    await act(async () => {
      secondProfit.resolve({ ...profitLineVersions, versions: [] });
      secondStaffing.resolve({ current: [], versions: [] });
      await Promise.resolve();
    });
    await waitFor(() => expect(profitButton.disabled).toBe(false));
    expect(staffingButton.disabled).toBe(false);
  });

  it('loads version data after the React StrictMode effect replay', async () => {
    render(<StrictMode><DecisionSettingsPanel /></StrictMode>);

    await screen.findByText('海景店');
    fireEvent.click(screen.getByText('盈利线'));
    expect((await screen.findAllByText('1000.10')).length).toBeGreaterThan(0);
  });

  it('requires confirmation before saving a staffing rule for the same effective date', async () => {
    decisionApi.getStaffingRuleVersions.mockResolvedValue({
      current: [],
      versions: [{
        id: 'staff-1', store_key: 'store-1', meal_period: 'lunch', role_code: 'cashier', role_name: '收银',
        minimum_headcount: 1, allocation_weight: '1.0000', target_revenue_per_labor_hour: '500.00',
        orders_per_labor_hour: null, effective_date: currentBeijingDate(), enabled: true,
        created_by: 'admin', created_at: '2026-08-01T09:00:00+08:00',
      }],
    });
    await renderPanel();
    fireEvent.click(screen.getByText('排班规则'));
    fireEvent.change(await screen.findByLabelText('岗位编码'), { target: { value: 'cashier' } });
    fireEvent.change(screen.getByLabelText('人效值'), { target: { value: '500.00' } });
    fireEvent.click(screen.getByRole('button', { name: '保存排班规则' }));

    expect((await screen.findAllByText('确认同一生效日保存？')).length).toBeGreaterThan(0);
    expect(decisionApi.saveStaffingRule).not.toHaveBeenCalled();
  });
});

describe('SettingsSection', () => {
  it('keeps the original panels in order and inserts decision settings after forecast', async () => {
    render(<SettingsSection show={vi.fn()} />);
    await act(async () => { await Promise.resolve(); });

    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent || '');
    expect(headings.indexOf('营业额预测模型')).toBeLessThan(headings.indexOf('经营决策规则'));
    expect(headings.indexOf('经营决策规则')).toBeLessThan(headings.indexOf('📍 门店地理'));
    expect(headings.indexOf('📍 门店地理')).toBeLessThan(headings.indexOf('店铺映射（人效前置）'));
    expect(headings.indexOf('店铺映射（人效前置）')).toBeLessThan(headings.indexOf('平台名'));
  });
});
