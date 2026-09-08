import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadEmployees: vi.fn().mockResolvedValue(undefined),
  saveShihengOrderAuth: vi.fn(),
  testShihengOrderAuth: vi.fn(),
}));

vi.mock('../../api/connectors', () => ({
  saveShihengOrderAuth: (...args: unknown[]) => mocks.saveShihengOrderAuth(...args),
  testShihengOrderAuth: (...args: unknown[]) => mocks.testShihengOrderAuth(...args),
}));

vi.mock('../../store/employeeStore', () => ({
  useEmployeeStore: (selector: (state: { items: []; loading: boolean; load: () => Promise<void> }) => unknown) =>
    selector({ items: [], loading: false, load: mocks.loadEmployees }),
}));

import { ShihengOrderAuthCard } from './widgets';

type Auth = {
  configured: boolean;
  openapi_configured: boolean;
  legacy_configured: boolean;
  auth_mode: 'openapi' | 'legacy';
  app_id: string;
  has_app_secret: boolean;
  app_secret_hint: string;
  alert_user_ids: string;
  enabled: boolean;
  updated_at: string;
};

function auth(overrides: Partial<Auth> = {}): Auth {
  return {
    configured: true,
    openapi_configured: true,
    legacy_configured: false,
    auth_mode: 'openapi',
    app_id: 'app-123',
    has_app_secret: true,
    app_secret_hint: 'abcd••••••••wxyz',
    alert_user_ids: 'employee-1',
    enabled: true,
    updated_at: '2026-07-27T10:00:00+08:00',
    ...overrides,
  };
}

function runtime() {
  return {
    schedule: {
      incremental_interval_minutes: 120,
      incremental_window_minutes: 60,
      monthly_backfill_time: '04:20',
      current_month_backfill_time: '04:20',
      previous_month_backfill_time: '12:00',
      timezone: 'Asia/Shanghai',
      dedupe_key: 'order_id',
      update_rule: 'status changed',
      built_in_schedules: [
        {
          key: 'incremental',
          name: '增量同步',
          cron_label: '每 2 小时',
          window_label: '同步昨日与今日订单变化',
          queue: 'shiheng_order_fast',
        },
        {
          key: 'daily_backfill',
          name: '昨日回补',
          cron_label: '每日 01:10',
          window_label: '回补昨日订单变化',
          queue: 'shiheng_order_backfill',
        },
        {
          key: 'recent_correction',
          name: '近期修正回扫',
          cron_label: '每天 03:20',
          window_label: '回扫 D-7 至 D-2',
          queue: 'shiheng_order_backfill',
        },
        {
          key: 'current_month_backfill',
          name: '本月校正回扫',
          cron_label: '每周日 04:20',
          window_label: '回扫月初至 D-8',
          queue: 'shiheng_order_backfill',
        },
        {
          key: 'previous_month_backfill',
          name: '上月兜底回扫',
          cron_label: '每月 1 号 12:00',
          window_label: '回扫上一个完整月份',
          queue: 'shiheng_order_backfill',
        },
      ],
    },
    runs: [
      {
        id: 'run-1',
        source_type: 'shop',
        run_kind: 'incremental',
        trigger_source: 'schedule',
        window_start: '2026-07-27',
        window_end: '2026-07-27',
        status: 'failed',
        pages_scanned: 1,
        list_count: 2,
        inserted_count: 1,
        updated_count: 0,
        detail_success_count: 1,
        detail_skipped_count: 0,
        detail_failed_count: 1,
        error_code: 'schema_mismatch',
        error_message: '响应异常',
        started_at: '2026-07-27T10:00:00+08:00',
        finished_at: '2026-07-27T10:01:00+08:00',
      },
    ],
    runs_page: { offset: 0, limit: 20, next_offset: 20, has_more: true },
  };
}

function card(
  authData = auth(),
  runtimeData: ReturnType<typeof runtime> | null = null,
  handlers: { onRefreshRuntime?: () => void; onLoadMoreRuns?: () => void } = {},
) {
  return (
    <ShihengOrderAuthCard
      auth={authData as never}
      runtime={runtimeData as never}
      isAdmin
      embedded
      onSaved={vi.fn()}
      onNotice={vi.fn()}
      {...handlers}
    />
  );
}

describe('ShihengOrderAuthCard', () => {
  it('shows the full app id and only the masked secret hint', () => {
    render(card());

    expect(screen.getByDisplayValue('app-123')).toBeTruthy();
    expect(screen.getByText(/abcd••••••••wxyz/)).toBeTruthy();
    expect(screen.queryByDisplayValue('abcd12345678wxyz')).toBeNull();
  });

  it('saves only the open API fields while preserving an empty secret', async () => {
    mocks.saveShihengOrderAuth.mockResolvedValue(auth({ app_id: 'app-new' }));
    render(card());

    fireEvent.change(screen.getByLabelText('AppId'), { target: { value: 'app-new' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(mocks.saveShihengOrderAuth).toHaveBeenCalledWith({
        app_id: 'app-new',
        app_secret: '',
        alert_user_ids: 'employee-1',
        enabled: true,
      });
    });
    expect((screen.getByLabelText('AppSecret') as HTMLInputElement).value).toBe('');
  });

  it('keeps edited app credentials when polling returns the same version', () => {
    const initialAuth = auth();
    const { rerender } = render(card(initialAuth));

    fireEvent.change(screen.getByLabelText('AppId'), { target: { value: 'typing-app' } });
    fireEvent.change(screen.getByLabelText('AppSecret'), { target: { value: 'typing-secret' } });
    rerender(card(auth({ app_id: 'server-app', updated_at: initialAuth.updated_at })));

    expect((screen.getByLabelText('AppId') as HTMLInputElement).value).toBe('typing-app');
    expect((screen.getByLabelText('AppSecret') as HTMLInputElement).value).toBe('typing-secret');
  });

  it('switches the authorization state without showing a hardcoded schedule', () => {
    const { rerender } = render(card());

    expect(screen.getByText('开放接口已启用')).toBeTruthy();
    expect(screen.queryByText(/每 30 分钟/)).toBeNull();

    rerender(card(auth({ auth_mode: 'legacy', openapi_configured: false, legacy_configured: true })));
    expect(screen.getByText('旧授权待迁移')).toBeTruthy();
    expect(screen.queryByText(/最近 60 分钟/)).toBeNull();

    rerender(card(auth({ enabled: false })));
    expect(screen.getByText('开放接口已停用')).toBeTruthy();
  });

  it('shows runtime schedule, failures, and refreshes or paginates task logs', () => {
    const onRefreshRuntime = vi.fn();
    const onLoadMoreRuns = vi.fn();
    render(card(auth(), runtime(), { onRefreshRuntime, onLoadMoreRuns }));

    expect(screen.getByText('当前定时策略')).toBeTruthy();
    expect(screen.getByText('定时任务运行状态')).toBeTruthy();
    expect(screen.getByText('最近任务日志')).toBeTruthy();
    expect(screen.getByText('昨日回补')).toBeTruthy();
    expect(screen.getByText('每日 01:10')).toBeTruthy();
    expect(screen.getByText('近期修正回扫')).toBeTruthy();
    expect(screen.getByText('本月校正回扫')).toBeTruthy();
    expect(screen.getByText('上月兜底回扫')).toBeTruthy();
    expect(screen.getAllByText('每 2 小时').length).toBeGreaterThan(0);
    expect(screen.queryByText(/当前时间往前 60 分钟/)).toBeNull();
    expect(screen.queryByText(/每日北京时间 04:20 回补/)).toBeNull();
    expect(screen.getByText(/schema_mismatch/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /刷\s*新/ }));
    expect(onRefreshRuntime).toHaveBeenCalledTimes(1);

    const list = screen.getByLabelText('最近任务日志');
    Object.defineProperties(list, {
      scrollTop: { value: 100, configurable: true },
      clientHeight: { value: 100, configurable: true },
      scrollHeight: { value: 200, configurable: true },
    });
    fireEvent.scroll(list);
    expect(onLoadMoreRuns).toHaveBeenCalledTimes(1);
  });
});
