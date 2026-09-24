import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { notification } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResponsePartsRenderer } from './ResponsePartsRenderer';
import type { AgentResponsePayload } from '../types';

function response(overrides: Partial<AgentResponsePayload> = {}): AgentResponsePayload {
  return {
    version: 1,
    domain: 'analytics',
    task: 'sales_summary',
    result_status: 'ok',
    result_id: 'result-1',
    source_turn_id: 'turn-1',
    parts: [],
    ...overrides,
  };
}

const originalMatchMedia = window.matchMedia;

function setMobileViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 767px)' ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('ResponsePartsRenderer', () => {
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    vi.restoreAllMocks();
  });

  it('renders summary metric labels and formatted units', () => {
    render(
      <ResponsePartsRenderer response={response({
        parts: [{
          kind: 'summary',
          title: '销售汇总',
          metrics: [
            { key: 'revenue', label: '实收金额', value: '12345.60', unit: 'CNY' },
            { key: 'orders', label: '订单数', value: '18', unit: 'order' },
            { key: 'stores', label: '统计门店数', value: '2', unit: 'store' },
          ],
        }],
      })} />,
    );

    expect(screen.getByText('销售汇总')).toBeTruthy();
    expect(screen.getByText('实收金额')).toBeTruthy();
    expect(screen.getByText('¥12,345.60')).toBeTruthy();
    expect(screen.getByText('订单数')).toBeTruthy();
    expect(screen.getByText('18单')).toBeTruthy();
    expect(screen.getByText('2家')).toBeTruthy();
  });

  it('formats transitional units and comparison states without leaking unknown codes', () => {
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <ResponsePartsRenderer response={response({
        parts: [
          {
            kind: 'summary',
            title: '展示语义',
            metrics: [
              { key: 'legacy-cny', value: '-12345.67', unit: 'CNY' },
              { key: 'cny', value: '12345.67', unit: 'cny' },
              { key: 'legacy-hour', value: '82.46', unit: 'CNY/hour' },
              { key: 'hour-rate', value: '82.46', unit: 'cny_per_hour' },
              { key: 'ratio', value: '0.092', unit: 'ratio' },
              { key: 'period', value: '3', unit: 'period' },
            ],
          },
          {
            kind: 'summary',
            metrics: [
              { key: 'product', value: '10', unit: 'product' },
              { key: 'item', value: '1234', unit: 'item' },
              { key: 'person', value: '12', unit: 'person' },
              { key: 'unknown-unit', value: '7', unit: 'secret_internal_unit' },
            ],
          },
          {
            kind: 'table',
            title: '可比状态',
            columns: [{ key: 'comparison_status', label: '可比状态' }],
            preview_rows: [
              { comparison_status: 'comparable' },
              { comparison_status: 'not_comparable' },
              { comparison_status: 'secret_internal_state' },
            ],
          },
        ],
      })} />,
    );

    for (const text of ['¥-12,345.67', '¥12,345.67', '¥82.46/工时', '9.2%', '3期', '10种', '1,234件', '12人', '可比', '不可比', '未知']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.queryByText(/secret_internal/)).toBeNull();
    expect(diagnostic).toHaveBeenCalled();
    expect(diagnostic.mock.calls.flat().join(' ')).not.toContain('secret_internal');
  });

  it('formats integer table cells with the same safe units and grouping as mobile', () => {
    render(<ResponsePartsRenderer response={response({
      parts: [{
        kind: 'table',
        title: '整数单位',
        columns: [
          { key: 'orders', label: '订单数', data_type: 'integer', unit: 'order' },
          { key: 'stores', label: '门店数', data_type: 'integer', unit: 'store' },
          { key: 'items', label: '件数', data_type: 'integer', unit: 'item' },
          { key: 'people', label: '人数', data_type: 'integer', unit: 'person' },
        ],
        preview_rows: [{ orders: '12345', stores: 12, items: '1234', people: 1200 }],
      }],
    })} />);

    for (const value of ['12,345单', '12家', '1,234件', '1,200人']) {
      expect(screen.getByText(value)).toBeTruthy();
    }
  });

  it('uses the same business enum labels as Markdown tables', () => {
    render(<ResponsePartsRenderer response={response({
      parts: [{
        kind: 'table',
        title: '业务状态',
        columns: [
          { key: 'attendance', label: '考勤状态' },
          { key: 'approval', label: '审批状态' },
          { key: 'task', label: '任务状态' },
        ],
        preview_rows: [{ attendance: 'LATE', approval: 'agree', task: 'COMPLETED' }],
      }],
    })} />);

    for (const value of ['迟到', '同意', '已完成']) {
      expect(screen.getByText(value)).toBeTruthy();
    }
  });

  it.each([
    ['partial', '结果不完整', false],
    ['empty', '暂无可用数据', false],
    ['unavailable', '数据暂不可用', true],
    ['failed', '分析失败', true],
  ] as const)('renders %s parts and applies the correct payload action gate', (status, banner, blocked) => {
    render(<ResponsePartsRenderer response={response({
      result_status: status,
      parts: [
        { kind: 'summary', title: '可用事实', metrics: [{ key: 'orders', value: '2', unit: 'order' }] },
        { kind: 'table', table_id: 'details', columns: [{ key: 'value', label: '值' }], preview_rows: Array.from({ length: 11 }, (_value, index) => ({ value: index + 1 })) },
        { kind: 'clarification', message: '请选择范围' },
      ],
      actions: [
        { action_id: 'prompt', kind: 'prompt', label: '继续分析', source_turn_id: 'turn-1', params: { message: '继续分析' } },
        { action_id: 'clarify', kind: 'clarify', label: '选择门店', source_turn_id: 'turn-1', params: { candidate_id: 'analytics:sales_summary', message: '选择门店' } },
        { action_id: 'expand_table', kind: 'local', label: '展开明细', result_id: 'result-1', params: { table_id: 'details' } },
      ],
    })} onPrompt={vi.fn()} onAction={vi.fn()} />);

    expect(screen.getByText(banner)).toBeTruthy();
    expect(screen.getByText('可用事实')).toBeTruthy();
    expect(screen.getByRole('button', { name: '继续分析' })).toHaveProperty('disabled', blocked);
    expect(screen.getByRole('button', { name: '选择门店' })).toHaveProperty('disabled', blocked);
    expect(Boolean(screen.queryByRole('button', { name: '展开全部' }))).toBe(!blocked);
  });

  it('renders daily table rows and the server-provided row count', () => {
    render(
      <ResponsePartsRenderer response={response({
        parts: [{
          kind: 'table',
          title: '每日销售',
          table_id: 'daily-sales',
          row_count: 31,
          columns: [
            { key: 'date', label: '日期' },
            { key: 'revenue', label: '实收', data_type: 'decimal', unit: 'CNY' },
          ],
          preview_rows: [
            { date: '2026-08-01', revenue: '1234.50' },
            { date: '2026-08-02', revenue: '2345.60' },
          ],
        }],
      })} />,
    );

    expect(screen.getByText('每日销售')).toBeTruthy();
    expect(screen.getByText('当前展示 2 / 31 行')).toBeTruthy();
    expect(screen.queryByTitle('下载表格')).toBeNull();
    expect(screen.getByTitle('全屏展示')).toBeTruthy();
    expect(screen.getByText('2026-08-01')).toBeTruthy();
    expect(screen.getByText('¥1,234.50')).toBeTruthy();
    expect(screen.getByText('2026-08-02')).toBeTruthy();
  });

  it('uses the shared business table actions when all structured rows are available', () => {
    render(<ResponsePartsRenderer response={response({
      parts: [{
        kind: 'table',
        title: '门店经营明细',
        row_count: 2,
        columns: [{ key: 'store', label: '门店' }],
        preview_rows: [{ store: '凤八店' }, { store: '凤十二店' }],
      }],
    })} />);

    expect(screen.getByText('2 行')).toBeTruthy();
    expect(screen.getByTitle('全屏展示')).toBeTruthy();
    expect(screen.getByTitle('下载表格')).toBeTruthy();
  });

  it('shows a clear no-data hint for empty results', () => {
    render(<ResponsePartsRenderer response={response({ result_status: 'empty' })} />);

    expect(screen.getByText('暂无可用数据')).toBeTruthy();
  });

  it('expands only preview rows already included in an expand_table action response', () => {
    setMobileViewport(true);
    render(
      <ResponsePartsRenderer response={response({
        parts: [{
          kind: 'table',
          title: '每日销售',
          table_id: 'daily-sales',
          columns: [{ key: 'date', label: '日期' }],
          preview_rows: [
            { date: '2026-08-01' },
            { date: '2026-08-02' },
            { date: '2026-08-03' },
            { date: '2026-08-04' },
          ],
        }],
        actions: [{
          action_id: 'expand_table',
          kind: 'local',
          result_id: 'result-1',
          label: '展开明细',
          params: { table_id: 'daily-sales' },
        }],
      })} animate streaming />,
    );

    expect(screen.queryByText('2026-08-04')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '展开全部' }));
    expect(screen.getByText('2026-08-04')).toBeTruthy();
  });

  it('can expand mobile structured tables that already include more than three preview rows without a local action', () => {
    setMobileViewport(true);
    render(
      <ResponsePartsRenderer response={response({
        parts: [{
          kind: 'table',
          title: '门店数据可用性',
          table_id: 'store-availability',
          columns: [{ key: 'store', label: '门店' }],
          preview_rows: [
            { store: '三桥店' },
            { store: '交大一附院店' },
            { store: '凤八店' },
            { store: '凤十二' },
          ],
        }],
      })} />,
    );

    expect(screen.queryByText('凤十二')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '展开全部' }));
    expect(screen.getByText('凤十二')).toBeTruthy();
  });

  it('collapses a mobile structured table after it has been expanded', () => {
    setMobileViewport(true);
    render(
      <ResponsePartsRenderer response={response({
        parts: [{
          kind: 'table',
          title: '门店数据可用性',
          table_id: 'store-availability',
          columns: [{ key: 'store', label: '门店' }],
          preview_rows: [
            { store: '三桥店' },
            { store: '交大一附院店' },
            { store: '凤八店' },
            { store: '凤十二' },
          ],
        }],
      })} />,
    );

    expect(screen.queryByText('凤十二')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '展开全部' }));
    expect(screen.getByText('凤十二')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(screen.queryByText('凤十二')).toBeNull();
  });

  it('shows ten table rows by default on desktop and allows expanding and collapsing them', () => {
    setMobileViewport(false);
    render(
      <ResponsePartsRenderer response={response({
        parts: [{
          kind: 'table',
          title: '门店数据可用性',
          table_id: 'store-availability',
          columns: [{ key: 'store', label: '门店' }],
          preview_rows: [
            { store: '门店01' },
            { store: '门店02' },
            { store: '门店03' },
            { store: '门店04' },
            { store: '门店05' },
            { store: '门店06' },
            { store: '门店07' },
            { store: '门店08' },
            { store: '门店09' },
            { store: '门店10' },
            { store: '门店11' },
          ],
        }],
      })} />,
    );

    expect(screen.getByText('门店10')).toBeTruthy();
    expect(screen.queryByText('门店11')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '展开全部' }));
    expect(screen.getByText('门店11')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(screen.getByText('门店10')).toBeTruthy();
    expect(screen.queryByText('门店11')).toBeNull();
  });

  it('ignores unknown response parts', () => {
    const { container } = render(
      <ResponsePartsRenderer response={response({
        parts: [{ kind: 'chart', title: '未支持图表' }],
      })} />,
    );

    expect(container.textContent).toBe('');
  });

  it('renders insights, warning notice and prompt actions at the answer bottom', async () => {
    const onPrompt = vi.fn().mockResolvedValue(undefined);
    render(
      <ResponsePartsRenderer response={response({
        parts: [
          {
            kind: 'insights',
            title: '经营结论',
            items: [{
              statement_type: 'fact',
              text: '订单数下降 8%。',
              evidence_refs: ['orders:2026-08-20'],
            }],
          },
          {
            kind: 'notice',
            title: '数据说明',
            message: '缺少 1 天快照。',
            severity: 'warning',
            code: 'missing_dates',
          },
        ],
        actions: [{
          action_id: 'compare_previous',
          kind: 'prompt',
          label: '对比上一周期',
          source_turn_id: 'turn-1',
          params: { message: '对比该门店上一周期的经营数据' },
        }],
      })} onPrompt={onPrompt} />,
    );

    expect(screen.getByRole('list', { name: '经营结论' })).toBeTruthy();
    expect(screen.getByText('事实')).toBeTruthy();
    expect(screen.getByText('订单数下降 8%。')).toBeTruthy();
    expect(screen.getByText('缺少 1 天快照。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '对比上一周期' }));
    await waitFor(() => expect(onPrompt).toHaveBeenCalledWith('对比该门店上一周期的经营数据'));
  });

  it('renders structured clarification without matching Chinese content', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(
      <ResponsePartsRenderer response={response({
        parts: [{ kind: 'clarification', message: '任意降级文字' }],
        actions: [{
          action_id: 'sales',
          kind: 'clarify',
          label: '查看经营销售数据',
          source_turn_id: 'turn-1',
          params: { candidate_id: 'analytics:sales_summary', message: '查看经营销售数据' },
        }],
      })} onAction={onAction} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看经营销售数据' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'clarify',
      params: expect.objectContaining({ candidate_id: 'analytics:sales_summary' }),
    })));
  });

  it('disables the clicked prompt until send resolves and restores it with an error notice after failure', async () => {
    let rejectSend!: (reason?: unknown) => void;
    const onPrompt = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectSend = reject;
    }));
    const notificationError = vi.fn();
    vi.spyOn(notification, 'useNotification').mockReturnValue([
      { error: notificationError },
      null,
    ] as never);
    render(
      <ResponsePartsRenderer response={response({
        actions: [{
          action_id: 'compare_previous',
          kind: 'prompt',
          label: '对比上一周期',
          source_turn_id: 'turn-1',
          params: { message: '对比该门店上一周期的经营数据' },
        }],
      })} onPrompt={onPrompt} />,
    );

    const button = screen.getByRole('button', { name: '对比上一周期' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onPrompt).toHaveBeenCalledTimes(1);
    expect(button).toHaveProperty('disabled', true);

    rejectSend(new Error('network failed'));

    await waitFor(() => expect(button).toHaveProperty('disabled', false));
    expect(notificationError).toHaveBeenCalledWith({
      title: '发送后续问题失败',
      duration: 5,
      closable: true,
    });
  });
});
