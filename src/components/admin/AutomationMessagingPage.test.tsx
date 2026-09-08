/** AutomationMessagingPage 冒烟测试：渲染/子分区切换/通道创建调用。 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listChannels: vi.fn().mockResolvedValue([]),
  createChannel: vi.fn().mockResolvedValue({}),
  testChannel: vi.fn().mockResolvedValue({ status: 'success' }),
  listRecipientEmployees: vi.fn().mockResolvedValue([]),
  draftAutomationRule: vi.fn().mockResolvedValue({ rule_config: { type: 'attendance_anomaly', rules: [] }, source: 'fallback', warnings: [] }),
  testWorkflowDraft: vi.fn().mockResolvedValue({ status: 'completed', run: { success_count: 1, failed_count: 0 } }),
  updateChannel: vi.fn().mockResolvedValue({}),
  deleteChannel: vi.fn().mockResolvedValue(undefined),
  listWorkflows: vi.fn().mockResolvedValue([]),
  createWorkflow: vi.fn().mockResolvedValue({}),
  updateWorkflow: vi.fn().mockResolvedValue({}),
  deleteWorkflow: vi.fn().mockResolvedValue(undefined),
  runWorkflowNow: vi.fn().mockResolvedValue({ status: 'completed', run: { success_count: 1, failed_count: 0 } }),
  listRuns: vi.fn().mockResolvedValue([]),
  listRunDeliveries: vi.fn().mockResolvedValue({ run: {}, deliveries: [] }),
  listBindings: vi.fn().mockResolvedValue([]),
  createBinding: vi.fn().mockResolvedValue({}),
  updateBinding: vi.fn().mockResolvedValue({}),
  deleteBinding: vi.fn().mockResolvedValue(undefined),
  listExternalMessages: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../api/automation', () => api);

import { AutomationMessagingPage } from './AutomationMessagingPage';
import { useChannelStore } from '../../store/channelStore';
import { useEmployeeStore } from '../../store/employeeStore';
import { useAuthStore } from '../../store/authStore';

describe('AutomationMessagingPage', () => {
  beforeEach(() => {
    Object.values(api).forEach(fn => fn.mockClear?.());
    localStorage.clear();
    sessionStorage.clear();
    useChannelStore.getState().reset();   // 全局缓存 store 跨用例复位
    useEmployeeStore.getState().reset();
    useAuthStore.setState({ tenantId: 'tenant-a' });
  });

  it('操作引导：默认收起，展开后点步骤跳分区', async () => {
    render(<AutomationMessagingPage />);
    expect(screen.queryByText('配置消息通道')).toBeNull();
    fireEvent.click(screen.getByText('展开'));
    expect(screen.getByText('配置消息通道')).toBeTruthy();
    expect(screen.getByText('查看推送日志')).toBeTruthy();
    // 点「查看推送日志」步骤 → 跳到推送日志分区并加载执行记录
    fireEvent.click(screen.getByText('查看推送日志'));
    await waitFor(() => expect(api.listRuns).toHaveBeenCalled());
    // 收起后步骤隐藏
    fireEvent.click(screen.getByText('收起'));
    expect(screen.queryByText('配置消息通道')).toBeNull();
  });

  it('默认渲染消息通道分区并加载通道', async () => {
    render(<AutomationMessagingPage />);
    expect(screen.getByText('新增钉钉消息通道')).toBeTruthy();
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());
  });

  it('消息通道只展示后端已实现的钉钉类型', async () => {
    render(<AutomationMessagingPage />);
    fireEvent.mouseDown(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: '工作通知（复用连接器，需 AgentId）' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '应用机器人对话（主动单聊，定时推送可靠）' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '群机器人 Webhook' })).toBeTruthy();
    expect(screen.queryByText(/飞书|企业微信|邮件/)).toBeNull();
  });

  it('历史非法通道可识别、停用、迁移和删除，但不能测试或启用', async () => {
    api.listChannels.mockResolvedValueOnce([{
      id: 'legacy-1',
      name: '历史飞书通道',
      provider: 'feishu',
      channel_type: 'work_notice',
      supported: false,
      enabled: true,
      config_summary: {},
      last_test_status: null,
      last_test_message: null,
      last_test_at: null,
    }]);
    render(<AutomationMessagingPage />);

    await waitFor(() => expect(screen.getByText('不支持，需迁移')).toBeTruthy());
    expect(screen.queryByText('测试发送')).toBeNull();
    expect(screen.queryByText('启用')).toBeNull();
    expect(screen.getByText('停用')).toBeTruthy();
    expect(screen.getByText('删除')).toBeTruthy();

    fireEvent.click(screen.getByText('迁移为钉钉工作通知'));
    await waitFor(() => expect(api.updateChannel).toHaveBeenCalledWith('legacy-1', {
      provider: 'dingtalk',
      channel_type: 'work_notice',
      enabled: false,
    }));
    expect(await screen.findByText('通道已迁移为钉钉工作通知并保持停用')).toBeTruthy();
  });

  it('历史非法通道不会进入新工作流通道选项', async () => {
    api.listChannels.mockResolvedValueOnce([{
      id: 'legacy-1',
      name: '历史飞书通道',
      provider: 'feishu',
      channel_type: 'work_notice',
      supported: false,
      enabled: false,
      config_summary: {},
      last_test_status: null,
      last_test_message: null,
      last_test_at: null,
    }]);
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalled());

    const field = screen
      .getAllByText('消息通道')
      .map((node) => node.parentElement)
      .find((node) => node?.querySelector('[role="combobox"]'));
    const selector = field?.querySelector('[role="combobox"]');
    expect(selector).toBeTruthy();
    fireEvent.mouseDown(selector as Element);
    expect(screen.queryByText('历史飞书通道')).toBeNull();
  });

  it('切到自动化工作流分区会加载工作流', async () => {
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalled());
    expect(screen.getByText('新增自动化工作流')).toBeTruthy();
  });

  it('切到对话入口分区会加载绑定与审计', async () => {
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('钉钉对话入口'));
    await waitFor(() => expect(api.listBindings).toHaveBeenCalled());
    expect(api.listExternalMessages).toHaveBeenCalled();
  });

  it('对话审计：列表只显示摘要，点击后查看完整内容', async () => {
    api.listExternalMessages.mockResolvedValueOnce([{
      id: 'msg-1',
      provider: 'dingtalk',
      external_user_id: '3158685350858035',
      direction: 'outbound',
      content: '按已同步连接器数据返回，共 7 条。\n明细：运营部-厨政研发部 | [敏感号] | 因监管不严导致门店出品不合格 | 运营部-厨政研发部 | [敏感号] | 门店稽核不合格',
      intent_category: null,
      status: 'ok',
      created_at: '2026-06-23T10:11:12',
    }]);
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('钉钉对话入口'));
    await waitFor(() => expect(screen.getByText(/按已同步连接器数据返回/)).toBeTruthy());
    expect(screen.queryByText(/门店稽核不合格/)).toBeNull();

    fireEvent.click(screen.getByText(/按已同步连接器数据返回/));
    expect(screen.getByText('对话审计详情')).toBeTruthy();
    expect(screen.getByText(/门店稽核不合格/)).toBeTruthy();
  });

  it('创建通道：填名称后点创建会调用 createChannel', async () => {
    render(<AutomationMessagingPage />);
    fireEvent.change(screen.getByPlaceholderText('如：人事钉钉工作通知'), { target: { value: '测试通道' } });
    fireEvent.click(screen.getByText('创建通道'));
    await waitFor(() => expect(api.createChannel).toHaveBeenCalled());
    expect(api.createChannel.mock.calls[0][0].name).toBe('测试通道');
  });

  it('创建应用机器人通道：带 robot_code 配置', async () => {
    render(<AutomationMessagingPage />);
    fireEvent.change(screen.getByPlaceholderText('如：人事钉钉工作通知'), { target: { value: '机器人通道' } });
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('应用机器人对话（主动单聊，定时推送可靠）'));
    fireEvent.change(screen.getByPlaceholderText('钉钉开放平台机器人 robotCode，如 dingxxxx'), { target: { value: 'dingrobot123' } });
    fireEvent.click(screen.getByText('创建通道'));
    await waitFor(() => expect(api.createChannel).toHaveBeenCalled());
    const body = api.createChannel.mock.calls[0][0];
    expect(body.channel_type).toBe('app_bot');
    expect(body.config).toEqual({ robot_code: 'dingrobot123' });
  });

  it('编辑工作流：除规则外可改，保存不回传 rule_config', async () => {
    api.listWorkflows.mockResolvedValueOnce([{
      id: 'wf-1', name: '夜班工时推送', workflow_type: 'notification', trigger_type: 'cron',
      cron_expr: '0 9 * * *', timezone: 'Asia/Shanghai', date_window_type: 'yesterday', enabled: true,
      channel_id: 'ch-1', recipient_config: { user_ids: ['u1'] },
      rule_config: { type: 'attendance_anomaly', rules: [{ reason: '时间异常' }] },
      message_template: null, next_run_at: null, last_run_at: null, last_run: null,
    }]);
    api.listChannels.mockResolvedValue([{
      id: 'ch-1', name: '钉钉通知', provider: 'dingtalk', channel_type: 'work_notice', enabled: true,
      config_summary: {}, last_test_status: null, last_test_message: null, last_test_at: null,
    }]);
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    await waitFor(() => expect(screen.getByText('夜班工时推送')).toBeTruthy());

    fireEvent.click(screen.getByText('编辑'));
    expect(screen.getByText('编辑工作流')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('夜班工时推送'), { target: { value: '改后的名称' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(api.updateWorkflow).toHaveBeenCalled());
    const [id, body] = api.updateWorkflow.mock.calls[0];
    expect(id).toBe('wf-1');
    expect(body.name).toBe('改后的名称');
    expect('rule_config' in body).toBe(false);   // 规则不回传，保持不变
  });

  it('编辑每周工作流：旧的最近 7 天窗口会规范为上一周', async () => {
    api.listWorkflows.mockResolvedValueOnce([{
      id: 'wf-weekly', name: '每周工时推送', workflow_type: 'notification', trigger_type: 'cron',
      cron_expr: '0 9 * * 1', timezone: 'Asia/Shanghai', date_window_type: 'last_7_days', enabled: true,
      channel_id: 'ch-1', recipient_config: { user_ids: ['u1'] }, rule_config: null,
      message_template: null, next_run_at: null, last_run_at: null, last_run: null,
    }]);
    api.listChannels.mockResolvedValue([{
      id: 'ch-1', name: '钉钉通知', provider: 'dingtalk', channel_type: 'work_notice', enabled: true,
      config_summary: {}, last_test_status: null, last_test_message: null, last_test_at: null,
    }]);
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    await waitFor(() => expect(screen.getByText('每周工时推送')).toBeTruthy());

    fireEvent.click(screen.getByText('编辑'));
    expect(screen.getByText('上一周（周一至周日）')).toBeTruthy();
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(api.updateWorkflow).toHaveBeenCalled());
    expect(api.updateWorkflow.mock.calls[0][1].date_window_type).toBe('last_week');
  });

  it('停用工作流禁用立即执行并展示原因', async () => {
    api.listWorkflows.mockResolvedValueOnce([{
      id: 'wf-disabled', name: '已停用推送', workflow_type: 'notification', trigger_type: 'cron',
      cron_expr: '0 9 * * *', timezone: 'Asia/Shanghai', date_window_type: 'yesterday', enabled: false,
      channel_id: 'ch-1', recipient_config: { user_ids: ['u1'] }, rule_config: null,
      message_template: null, next_run_at: null, last_run_at: null, last_run: null,
    }]);
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));

    const button = await screen.findByRole('button', { name: '立即执行' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('工作流已停用，启用后才能立即执行');
    fireEvent.click(button);
    expect(api.runWorkflowNow).not.toHaveBeenCalled();
  });

  it('立即执行：执行中显示 loading 且禁用，防重复点击', async () => {
    api.listWorkflows.mockResolvedValueOnce([{
      id: 'wf-1', name: '夜班工时推送', workflow_type: 'notification', trigger_type: 'cron',
      cron_expr: '0 9 * * *', timezone: 'Asia/Shanghai', date_window_type: 'yesterday', enabled: true,
      channel_id: 'ch-1', recipient_config: { user_ids: ['u1'] }, rule_config: null,
      message_template: null, next_run_at: null, last_run_at: null, last_run: null,
    }]);
    let resolveRun: ((v: unknown) => void) | undefined;
    api.runWorkflowNow.mockImplementationOnce(() => new Promise(r => { resolveRun = r; }));

    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    await waitFor(() => expect(screen.getByText('立即执行')).toBeTruthy());

    fireEvent.click(screen.getByText('立即执行'));
    await waitFor(() => expect(screen.getByText('执行中…')).toBeTruthy());

    const btn = screen.getByText('执行中…').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);            // 禁用 → 防重复点击
    fireEvent.click(btn);                         // 再点无效
    expect(api.runWorkflowNow).toHaveBeenCalledTimes(1);

    resolveRun?.({ status: 'completed', run: { success_count: 1, failed_count: 0 } });
    await waitFor(() => expect(screen.queryByText('执行中…')).toBeNull());
  });

  it('立即执行 pending：先提示已提交，再轮询到终态', async () => {
    api.listWorkflows.mockResolvedValueOnce([{
      id: 'wf-pending', name: '待执行推送', workflow_type: 'notification', trigger_type: 'cron',
      cron_expr: '0 9 * * *', timezone: 'Asia/Shanghai', date_window_type: 'yesterday', enabled: true,
      channel_id: 'ch-1', recipient_config: { user_ids: ['u1'] }, rule_config: null,
      message_template: null, next_run_at: null, last_run_at: null, last_run: null,
    }]);
    api.runWorkflowNow.mockResolvedValueOnce({
      status: 'pending',
      idempotency_key: 'request-1',
      run: { id: 'run-1', workflow_id: 'wf-pending', status: 'pending', success_count: 0, failed_count: 0 },
    });
    api.listRuns
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'run-1', workflow_id: 'wf-pending', status: 'completed',
        success_count: 2, failed_count: 0,
      }]);

    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    await waitFor(() => expect(screen.getByText('待执行推送')).toBeTruthy());
    fireEvent.click(screen.getByText('立即执行'));

    await waitFor(() => expect(screen.getByText('已提交执行')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('执行完成')).toBeTruthy());
    expect(api.listRuns).toHaveBeenCalledWith('wf-pending');
  });

  it('组件重挂载后复用 sessionStorage 中不确定的 idempotency key', async () => {
    const workflow = {
      id: 'wf-retry', name: '重试推送', workflow_type: 'notification', trigger_type: 'cron',
      cron_expr: '0 9 * * *', timezone: 'Asia/Shanghai', date_window_type: 'yesterday', enabled: true,
      channel_id: 'ch-1', recipient_config: { user_ids: ['u1'] }, rule_config: null,
      message_template: null, next_run_at: null, last_run_at: null, last_run: null,
    };
    api.listWorkflows
      .mockResolvedValueOnce([workflow])
      .mockResolvedValueOnce([workflow]);
    api.runWorkflowNow
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        status: 'completed',
        idempotency_key: 'request-reused',
        run: { id: 'run-1', status: 'completed', success_count: 1, failed_count: 0 },
      });

    const firstRender = render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    await waitFor(() => expect(screen.getByText('重试推送')).toBeTruthy());
    fireEvent.click(screen.getByText('立即执行'));
    await waitFor(() => expect(screen.getByText('执行请求结果不确定')).toBeTruthy());
    const storedKey = sessionStorage.getItem('automation-run-now:tenant-a:wf-retry');
    expect(storedKey).toBeTruthy();

    firstRender.unmount();
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    await waitFor(() => expect(screen.getByText('重试推送')).toBeTruthy());
    fireEvent.click(screen.getByText('立即执行'));
    await waitFor(() => expect(api.runWorkflowNow).toHaveBeenCalledTimes(2));
    expect(api.runWorkflowNow.mock.calls[0][1]).toBe(storedKey);
    expect(api.runWorkflowNow.mock.calls[1][1]).toBe(storedKey);
    expect(sessionStorage.getItem('automation-run-now:tenant-a:wf-retry')).toBeNull();
  });

  it('408/429/5xx 保留 key，确定性 4xx 清除 key', async () => {
    const workflow = {
      id: 'wf-errors', name: '错误分类推送', workflow_type: 'notification', trigger_type: 'cron',
      cron_expr: '0 9 * * *', timezone: 'Asia/Shanghai', date_window_type: 'yesterday', enabled: true,
      channel_id: 'ch-1', recipient_config: { user_ids: ['u1'] }, rule_config: null,
      message_template: null, next_run_at: null, last_run_at: null, last_run: null,
    };
    api.listWorkflows.mockResolvedValueOnce([workflow]);
    api.runWorkflowNow
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { responseReceived: true, status: 408 }))
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { responseReceived: true, status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error('server'), { responseReceived: true, status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('invalid'), { responseReceived: true, status: 422 }));

    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    await waitFor(() => expect(screen.getByText('错误分类推送')).toBeTruthy());
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      fireEvent.click(screen.getByText('立即执行'));
      await waitFor(() => expect(api.runWorkflowNow).toHaveBeenCalledTimes(attempt));
      await waitFor(() => expect((screen.getByText('立即执行').closest('button') as HTMLButtonElement).disabled).toBe(false));
      expect(sessionStorage.getItem('automation-run-now:tenant-a:wf-errors')).toBeTruthy();
    }

    fireEvent.click(screen.getByText('立即执行'));
    await waitFor(() => expect(api.runWorkflowNow).toHaveBeenCalledTimes(4));
    expect(sessionStorage.getItem('automation-run-now:tenant-a:wf-errors')).toBeNull();
  });

  it('pending 每 3 秒持续轮询，并在组件卸载时清理 timer', async () => {
    const workflow = {
      id: 'wf-poll', name: '持续轮询推送', workflow_type: 'notification', trigger_type: 'cron',
      cron_expr: '0 9 * * *', timezone: 'Asia/Shanghai', date_window_type: 'yesterday', enabled: true,
      channel_id: 'ch-1', recipient_config: { user_ids: ['u1'] }, rule_config: null,
      message_template: null, next_run_at: null, last_run_at: null, last_run: null,
    };
    api.listWorkflows.mockResolvedValueOnce([workflow]);
    api.runWorkflowNow.mockResolvedValueOnce({
      status: 'pending',
      idempotency_key: 'request-poll',
      run: { id: 'run-poll', workflow_id: 'wf-poll', status: 'pending', success_count: 0, failed_count: 0 },
    });
    api.listRuns
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'run-poll', workflow_id: 'wf-poll', status: 'pending',
        success_count: 0, failed_count: 0,
      }]);
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    const view = render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    await waitFor(() => expect(screen.getByText('持续轮询推送')).toBeTruthy());
    fireEvent.click(screen.getByText('立即执行'));
    await waitFor(() => expect(api.listRuns.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(setTimeoutSpy.mock.calls.some(call => call[1] === 3000)).toBe(true);

    view.unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it('切到推送日志分区会加载执行记录', async () => {
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('推送日志'));
    await waitFor(() => expect(api.listRuns).toHaveBeenCalled());
  });

  it('推送日志展示推送标题与接收员工名', async () => {
    api.listRuns.mockResolvedValueOnce([{
      id: 'run-1', workflow_id: 'wf-1', run_date: '2026-06-16', status: 'completed',
      total_count: 3, success_count: 3, failed_count: 0, error_message: null,
      started_at: null, finished_at: null,
      workflow_name: '夜班工时推送', title: '夜班工时日报（2026-06-16）',
      recipient_names: ['张三', '李四', '王五'],
    }]);
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('推送日志'));
    await waitFor(() => expect(screen.getByText('夜班工时日报（2026-06-16）')).toBeTruthy());
    expect(screen.getByText('接收：张三、李四、王五')).toBeTruthy();
  });

  it('生成规则草稿后展示附加查询「是否有数据 + 用了哪些数据」', async () => {
    api.draftAutomationRule.mockResolvedValueOnce({
      rule_config: {
        type: 'attendance_anomaly',
        rules: [{ reason: '时间异常' }],
        data_queries: [{
          message: '统计直营店排班工时',
          resolved: { status: 'ok', summary: '数据集「钉钉排班月度汇总」 · 范围=直营 · 指标=排班工时', hint: '' },
        }],
      },
      source: 'llm',
      warnings: [],
    });
    render(<AutomationMessagingPage />);
    fireEvent.click(screen.getByText('自动化工作流'));
    fireEvent.click(screen.getByText('生成规则草稿'));
    await waitFor(() => expect(screen.getByText('✓ 有数据')).toBeTruthy());
    expect(screen.getByText(/用到的数据：数据集「钉钉排班月度汇总」/)).toBeTruthy();
  });
});
