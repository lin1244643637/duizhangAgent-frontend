/** 自动化与消息（M1–M4）：消息通道 / 自动化工作流 / 钉钉对话入口 / 推送日志。 */

import { useEffect, useRef, useState } from 'react';
import { Button, ConfigProvider, Input, Modal, notification, Select, TreeSelect } from 'antd';
import {
  type AutomationRun,
  type AutomationWorkflow,
  type Delivery,
  type ExternalBinding,
  type ExternalMessage,
  type NotificationChannel,
  type AutomationRecipientEmployee,
  createBinding,
  createChannel,
  createWorkflow,
  deleteBinding,
  deleteChannel,
  deleteWorkflow,
  draftAutomationRule,
  listBindings,
  listExternalMessages,
  listRunDeliveries,
  listRuns,
  listWorkflows,
  runWorkflowNow,
  testChannel,
  testWorkflowDraft,
  updateBinding,
  updateChannel,
  updateWorkflow,
} from '../../api/automation';
import { useChannelStore } from '../../store/channelStore';
import { useEmployeeStore } from '../../store/employeeStore';
import { useAuthStore } from '../../store/authStore';
import { listUsers } from '../../api/admin';
import type { AdminUser } from '../../types';
import { EmployeeMultiSelect } from '../EmployeeMultiSelect';

type SubTab = 'channels' | 'workflows' | 'bindings' | 'logs';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'channels', label: '消息通道' },
  { key: 'workflows', label: '自动化工作流' },
  { key: 'bindings', label: '钉钉对话入口' },
  { key: 'logs', label: '推送日志' },
];

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-emerald-600', sent: 'text-emerald-600', success: 'text-emerald-600', ok: 'text-emerald-600',
  partial_failed: 'text-amber-600', failed: 'text-red-600', blocked: 'text-amber-600', denied: 'text-red-600',
  running: 'text-blue-600', pending: 'text-slate-500',
};

function statusClass(s: string | null | undefined): string {
  return STATUS_COLORS[s || ''] || 'text-slate-500';
}

const GUIDE_STEPS: { tab: SubTab; title: string; desc: string }[] = [
  { tab: 'channels', title: '配置消息通道', desc: '建一个钉钉通道并「测试发送」确认能收到。定时主动推送建议选「应用机器人对话」，最稳。' },
  { tab: 'workflows', title: '创建自动化工作流', desc: '用自然语言描述规则 → 生成草稿（看“是否有数据/用了哪些数据”）→ 选通道、接收人、执行时间 → 创建，可「立即执行」试跑。' },
  { tab: 'bindings', title: '（可选）钉钉对话入口', desc: '把钉钉用户绑定到系统账号并设权限，员工即可在钉钉里直接找人事 Agent 对话查询。' },
  { tab: 'logs', title: '查看推送日志', desc: '每次执行的标题、接收员工、命中/成功/失败一目了然；点「明细」看每个人的送达状态。' },
];

const GUIDE_KEY = 'automation_guide_collapsed';

function readGuideCollapsed(): boolean {
  try {
    const value = localStorage.getItem(GUIDE_KEY);
    return value === null ? true : value === '1';
  } catch {
    return true;
  }
}

function GuideCard({ tab, onJump }: { tab: SubTab; onJump: (t: SubTab) => void }) {
  const [collapsed, setCollapsed] = useState(readGuideCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(GUIDE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
          <span>操作引导</span>
          <span className="hidden text-xs font-normal text-blue-500 sm:inline">从左到右走一遍，即可上线一条定时推送</span>
        </div>
        <Button htmlType="button" onClick={toggle} className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer">{collapsed ? '展开' : '收起'}</Button>
      </div>
      {!collapsed && (
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {GUIDE_STEPS.map((s, i) => {
            const active = s.tab === tab;
            return (
              <li key={s.tab} className="h-full">
                <button
                  type="button"
                  onClick={() => onJump(s.tab)}
                  className={`flex h-full w-full flex-col rounded-lg border px-3 py-2 text-left shadow-none transition-colors cursor-pointer ${
                    active ? 'border-blue-400 bg-white shadow-sm' : 'border-transparent bg-white/60 hover:bg-white'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${active ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>{i + 1}</span>
                    {s.title}
                  </span>
                  <span className="mt-1 text-xs leading-relaxed text-slate-500">{s.desc}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function AutomationMessagingPage() {
  const [tab, setTab] = useState<SubTab>('channels');
  const [notificationApi, notificationContextHolder] = notification.useNotification();
  const show: ShowFn = (message, variant = 'info') => notificationApi[variant]({
    message,
    duration: 5,
    closable: true,
  });

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <div className="space-y-4">
        {notificationContextHolder}
        <GuideCard tab={tab} onJump={setTab} />
        <div className="flex w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-0.5 md:w-fit">
          {SUB_TABS.map(t => (
            <Button
              htmlType="button"
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`h-auto shrink-0 border-0 px-4 py-1.5 rounded-md text-sm shadow-none transition-colors cursor-pointer ${
                tab === t.key ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {tab === 'channels' && <ChannelsSection show={show} />}
        {tab === 'workflows' && <WorkflowsSection show={show} />}
        {tab === 'bindings' && <BindingsSection show={show} />}
        {tab === 'logs' && <LogsSection show={show} />}

      </div>
    </ConfigProvider>
  );
}

type NoticeVariant = 'success' | 'info' | 'warning' | 'error';
type ShowFn = (message: string, variant?: NoticeVariant) => void;

function uncertainRunStorageKey(tenantId: string, workflowId: string) {
  return `automation-run-now:${tenantId || 'unknown'}:${workflowId}`;
}

function shouldKeepUncertainRunKey(
  error: Error & { responseReceived?: boolean; status?: number },
) {
  if (!error.responseReceived) return true;
  const status = error.status || 0;
  return status === 408 || status === 429 || status >= 500;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block mb-2 text-sm">
      <div className="text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm';
const UNASSIGNED_DEPARTMENT = '未同步部门';
const DEPARTMENT_NODE_PREFIX = 'department:';

function employeeDepartments(employee: AutomationRecipientEmployee): string[] {
  const names = (employee.department_names || []).map(name => name.trim()).filter(Boolean);
  return names.length ? names : [UNASSIGNED_DEPARTMENT];
}

function primaryDepartment(employee: AutomationRecipientEmployee): string {
  return employeeDepartments(employee)[0];
}

type RecipientTreeNode = {
  title: React.ReactNode;
  label: string;
  value: string;
  key: string;
  searchText: string;
  children?: RecipientTreeNode[];
};

function useRecipientEmployees(show: ShowFn) {
  // 员工通讯录走全局缓存：本页两处 + 经营分析/连接器都读同一份，不再各拉各的。
  const employees = useEmployeeStore(s => s.items);
  const loading = useEmployeeStore(s => s.loading);
  const load = useEmployeeStore(s => s.load);
  useEffect(() => { load().catch(e => show((e as Error).message, 'error')); }, []);
  return { employees, loading };
}

function EmployeeSingleSelect({
  employees,
  loading,
  selectedId,
  onChange,
  placeholder = '搜索姓名、部门、职位或 userId',
}: {
  employees: AutomationRecipientEmployee[];
  loading: boolean;
  selectedId: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const departmentCounts = employees.reduce<Record<string, number>>((acc, employee) => {
    const department = primaryDepartment(employee);
    acc[department] = (acc[department] || 0) + 1;
    return acc;
  }, {});
  const departmentOptions = Object.keys(departmentCounts).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const groupedEmployees = employees.reduce<Record<string, AutomationRecipientEmployee[]>>((acc, employee) => {
    const department = primaryDepartment(employee);
    if (!acc[department]) acc[department] = [];
    acc[department].push(employee);
    return acc;
  }, {});
  const treeData: RecipientTreeNode[] = departmentOptions.map(department => {
    const items = groupedEmployees[department] || [];
    return {
      title: `${department}（${items.length}人）`,
      label: department,
      value: `${DEPARTMENT_NODE_PREFIX}${department}`,
      key: `${DEPARTMENT_NODE_PREFIX}${department}`,
      searchText: department,
      children: items.map(employee => ({
        title: (
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="font-medium text-slate-700">{employee.name}</span>
            <span className="truncate text-xs text-slate-400">
              {employeeDepartments(employee).join(' / ')}
              {employee.position ? ` · ${employee.position}` : ''}
              {' · '}
              {employee.ding_user_id}
            </span>
          </span>
        ),
        label: employee.name,
        value: employee.ding_user_id,
        key: employee.ding_user_id,
        searchText: [
          employee.name,
          employee.ding_user_id,
          employee.position,
          ...employeeDepartments(employee),
        ].filter(Boolean).join(' ').toLowerCase(),
      })),
    };
  });

  function filterTreeNode(input: string, node: unknown): boolean {
    const keyword = input.trim().toLowerCase();
    if (!keyword) return true;
    const data = node as { searchText?: string; label?: string; value?: string };
    return [data.searchText, data.label, data.value]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  }

  if (loading) {
    return <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">正在加载员工通讯录...</div>;
  }

  if (employees.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        员工通讯录暂无可选人员。请先到「企业数据连接器」同步「钉钉员工通讯录」，同步完成后再回来绑定钉钉用户。
      </div>
    );
  }

  return (
    <div>
      <TreeSelect
        className="w-full"
        value={selectedId || undefined}
        onChange={value => onChange(String(value || ''))}
        treeData={treeData}
        showSearch={{ treeNodeFilterProp: 'searchText', filterTreeNode }}
        allowClear
        treeNodeLabelProp="label"
        placeholder={placeholder}
        listHeight={320}
        popupMatchSelectWidth={420}
        treeDefaultExpandedKeys={departmentOptions.slice(0, 1).map(department => `${DEPARTMENT_NODE_PREFIX}${department}`)}
        notFoundContent="没有匹配的员工"
        onClear={() => onChange('')}
      />
      {selectedId && <div className="mt-1 text-xs text-slate-400">将保存钉钉 userId：{selectedId}</div>}
    </div>
  );
}

function SystemUserSelect({
  users,
  loading,
  selectedId,
  onChange,
}: {
  users: AdminUser[];
  loading: boolean;
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const treeData = users.map(user => ({
    title: (
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className="font-medium text-slate-700">{user.username}</span>
        <span className="truncate text-xs text-slate-400">{user.role} · {user.id}</span>
      </span>
    ),
    label: user.username,
    value: user.id,
    key: user.id,
    searchText: [user.username, user.role, user.id].join(' ').toLowerCase(),
  }));

  function filterTreeNode(input: string, node: unknown): boolean {
    const keyword = input.trim().toLowerCase();
    if (!keyword) return true;
    const data = node as { searchText?: string; label?: string; value?: string };
    return [data.searchText, data.label, data.value]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  }

  if (loading) {
    return <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">正在加载系统用户...</div>;
  }

  if (users.length === 0) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">当前租户暂无可绑定的系统用户。</div>;
  }

  return (
    <div>
      <TreeSelect
        className="w-full"
        value={selectedId || undefined}
        onChange={value => onChange(String(value || ''))}
        treeData={treeData}
        showSearch={{ treeNodeFilterProp: 'searchText', filterTreeNode }}
        allowClear
        treeNodeLabelProp="label"
        placeholder="搜索系统用户名、角色或用户 ID"
        listHeight={280}
        popupMatchSelectWidth={420}
        notFoundContent="没有匹配的系统用户"
        onClear={() => onChange('')}
      />
      {selectedId && <div className="mt-1 text-xs text-slate-400">将保存系统用户 ID：{selectedId}</div>}
    </div>
  );
}

function buildCronExpr(frequency: 'daily' | 'weekly' | 'monthly', runTime: string, weekday: string, monthDay: string): string {
  const [hourRaw, minuteRaw] = (runTime || '09:00').split(':');
  const hour = String(Math.min(23, Math.max(0, Number(hourRaw) || 0)));
  const minute = String(Math.min(59, Math.max(0, Number(minuteRaw) || 0)));
  if (frequency === 'weekly') return `${minute} ${hour} * * ${weekday || '1'}`;
  if (frequency === 'monthly') return `${minute} ${hour} ${monthDay || '1'} * *`;
  return `${minute} ${hour} * * *`;
}

function parseCronExpr(cron: string | null): { frequency: 'daily' | 'weekly' | 'monthly'; runTime: string; weekday: string; monthDay: string } {
  const fallback = { frequency: 'daily' as const, runTime: '09:00', weekday: '1', monthDay: '1' };
  const parts = (cron || '').trim().split(/\s+/);
  if (parts.length !== 5) return fallback;
  const [minute, hour, dom, , dow] = parts;
  const runTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  if (dow && dow !== '*') return { frequency: 'weekly', runTime, weekday: dow, monthDay: '1' };
  if (dom && dom !== '*') return { frequency: 'monthly', runTime, weekday: '1', monthDay: dom };
  return { frequency: 'daily', runTime, weekday: '1', monthDay: '1' };
}

const DATE_WINDOW_OPTIONS = [
  { value: 'yesterday', label: '昨天' },
  { value: 'tomorrow', label: '明天（预测）' },
  { value: 'last_week', label: '上一周（周一至周日）' },
  { value: 'next_week', label: '下一周（预测）' },
  { value: 'last_7_days', label: '最近 7 天（滚动）' },
  { value: 'current_month', label: '本月截至今天' },
  { value: 'previous_month', label: '上个月整月' },
  { value: 'next_month', label: '下个月（预测）' },
];
const FREQUENCY_OPTIONS = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
];
const WEEKDAY_OPTIONS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '0', label: '周日' },
];
const MONTH_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => {
  const day = String(i + 1);
  return { value: day, label: `${day} 号` };
});

function defaultDateWindowForFrequency(frequency: 'daily' | 'weekly' | 'monthly'): string {
  if (frequency === 'weekly') return 'last_week';
  if (frequency === 'monthly') return 'previous_month';
  return 'yesterday';
}

function normalizeDateWindowForFrequency(frequency: 'daily' | 'weekly' | 'monthly', value: string): string {
  if (frequency === 'weekly' && value === 'last_7_days') return 'last_week';
  return value || defaultDateWindowForFrequency(frequency);
}

function shouldAutoSwitchDateWindow(value: string): boolean {
  return ['yesterday', 'last_week', 'last_7_days', 'current_month', 'previous_month'].includes(value);
}

function dateWindowLabel(value: unknown): string {
  const text = String(value || '');
  return DATE_WINDOW_OPTIONS.find(item => item.value === text)?.label || text || '未设置';
}

function dateWindowFromRule(ruleConfig: Record<string, unknown>): string {
  if (ruleConfig.type !== 'revenue_forecast') return '';
  const value = String(ruleConfig.forecast_window || '');
  return DATE_WINDOW_OPTIONS.some(item => item.value === value) ? value : '';
}

function granularityLabel(value: unknown): string {
  const labels: Record<string, string> = { day: '日', week: '周', month: '月' };
  const text = String(value || '');
  return labels[text] || text || '自动';
}

const DATA_QUERY_BADGES: Record<string, { label: string; cls: string }> = {
  ok: { label: '✓ 有数据', cls: 'text-emerald-600' },
  no_data: { label: '⚠ 无数据', cls: 'text-amber-600' },
  needs_clarification: { label: '需补充', cls: 'text-amber-600' },
  needs_computation: { label: '需计算', cls: 'text-amber-600' },
  no_dataset: { label: '未匹配数据集', cls: 'text-red-500' },
  no_connector: { label: '未配连接器', cls: 'text-red-500' },
  error: { label: '解析失败', cls: 'text-red-500' },
};

function RuleSummary({ ruleConfig }: { ruleConfig: Record<string, unknown> }) {
  if (ruleConfig.type === 'revenue_forecast') {
    const dim = String(ruleConfig.dim || '');
    return (
      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <div className="mb-1 font-medium text-slate-600">预测规则</div>
        <div className="flex flex-wrap gap-1">
          <span className="rounded-full bg-white px-2 py-0.5 text-slate-600">范围：{dateWindowLabel(ruleConfig.forecast_window)}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-slate-600">粒度：{granularityLabel(ruleConfig.granularity)}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-slate-600">指标：净实收</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-slate-600">维度：{dim === 'shop' ? '门店' : '整体'}</span>
        </div>
      </div>
    );
  }
  const rules = Array.isArray(ruleConfig.rules) ? ruleConfig.rules as Record<string, unknown>[] : [];
  const dataQueries = Array.isArray(ruleConfig.data_queries) ? ruleConfig.data_queries as Array<Record<string, unknown> | string> : [];
  if (rules.length === 0 && dataQueries.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
      {rules.length > 0 && (
        <>
          <div className="mb-1 font-medium text-slate-600">异常规则</div>
          <div className="flex flex-wrap gap-1">
            {rules.map((rule, index) => (
              <span key={`${rule.reason || index}`} className="rounded-full bg-white px-2 py-0.5 text-slate-600">
                {String(rule.reason || `规则 ${index + 1}`)}
              </span>
            ))}
          </div>
        </>
      )}
      {dataQueries.length > 0 && (
        <div className={rules.length > 0 ? 'mt-2' : ''}>
          <div className="mb-1 font-medium text-slate-600">附加查询</div>
          <div className="space-y-1">
            {dataQueries.map((query, index) => {
              const q = typeof query === 'string' ? { message: query } : (query as Record<string, unknown>);
              const message = String(q.message || q.query || `查询 ${index + 1}`);
              const resolved = q.resolved && typeof q.resolved === 'object' ? (q.resolved as Record<string, unknown>) : null;
              const status = resolved ? String(resolved.status || '') : '';
              const badge = DATA_QUERY_BADGES[status];
              return (
                <div key={`${message}-${index}`} className="rounded-md bg-white px-2 py-1.5 text-slate-600">
                  <div className="flex items-center gap-2">
                    {badge && <span className={`shrink-0 text-xs font-medium ${badge.cls}`}>{badge.label}</span>}
                    <span className="min-w-0 truncate">{message}</span>
                  </div>
                  {resolved && resolved.summary ? (
                    <div className="mt-0.5 text-xs text-slate-400">用到的数据：{String(resolved.summary)}</div>
                  ) : null}
                  {resolved && resolved.overridden_from ? (
                    <div className="mt-0.5 text-xs text-slate-400">已按你点名的数据集（系统本会选「{String(resolved.overridden_from)}」）</div>
                  ) : null}
                  {resolved && status !== 'ok' && resolved.hint ? (
                    <div className="mt-0.5 text-xs text-amber-600">{String(resolved.hint)}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ruleCount(ruleConfig: Record<string, unknown>): number {
  if (ruleConfig.type === 'revenue_forecast') return 1;
  const rules = Array.isArray(ruleConfig.rules) ? ruleConfig.rules.length : 0;
  const dataQueries = Array.isArray(ruleConfig.data_queries) ? ruleConfig.data_queries.length : 0;
  return rules + dataQueries;
}

// ── 消息通道 ────────────────────────────────────────────────────────────

const SUPPORTED_CHANNEL_TYPE_OPTIONS = [
  { value: 'work_notice', label: '工作通知（复用连接器，需 AgentId）' },
  { value: 'app_bot', label: '应用机器人对话（主动单聊，定时推送可靠）' },
  { value: 'group_webhook', label: '群机器人 Webhook' },
];

function ChannelsSection({ show }: { show: ShowFn }) {
  const channels = useChannelStore(s => s.items);   // 通道走全局缓存（与经营分析推送弹窗共用）
  const loadChannels = useChannelStore(s => s.load);
  const [name, setName] = useState('');
  const [channelType, setChannelType] = useState('work_notice');
  const [agentId, setAgentId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [robotCode, setRobotCode] = useState('');
  const [testUserIds, setTestUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { employees, loading: employeesLoading } = useRecipientEmployees(show);

  // 增删改后 force 刷新共享缓存，其它页面（如经营分析推送弹窗）也拿到最新。
  const reload = () => loadChannels(true).catch(e => show(e.message, 'error'));
  useEffect(() => { loadChannels().catch(e => show(e.message, 'error')); }, []);

  async function onCreate() {
    if (!name.trim()) return show('请填写通道名称', 'warning');
    const config = channelType === 'group_webhook'
      ? { webhook_url: webhookUrl.trim(), secret: secret.trim() }
      : channelType === 'app_bot'
        ? { robot_code: robotCode.trim() }
        : { agent_id: agentId.trim() };
    setBusy(true);
    try {
      await createChannel({ provider: 'dingtalk', channel_type: channelType, name: name.trim(), config });
      show('通道已创建', 'success');
      setName(''); setAgentId(''); setWebhookUrl(''); setSecret(''); setRobotCode('');
      reload();
    } catch (e) { show((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function onTest(c: NotificationChannel) {
    if (c.channel_type === 'work_notice' && testUserIds.length === 0) return show('工作通知需要先选择测试接收人', 'warning');
    try {
      await testChannel(c.id, { user_ids: testUserIds });
      show('测试消息已发送', 'success');
      reload();
    } catch (e) { show((e as Error).message, 'error'); }
  }

  async function onToggle(c: NotificationChannel) {
    try { await updateChannel(c.id, { enabled: !c.enabled }); reload(); } catch (e) { show((e as Error).message, 'error'); }
  }

  async function onMigrate(c: NotificationChannel) {
    try {
      await updateChannel(c.id, {
        provider: 'dingtalk',
        channel_type: 'work_notice',
        enabled: false,
      });
      show('通道已迁移为钉钉工作通知并保持停用', 'success');
      reload();
    } catch (e) { show((e as Error).message, 'error'); }
  }

  async function onDelete(c: NotificationChannel) {
    try { await deleteChannel(c.id); show('已删除', 'success'); reload(); } catch (e) { show((e as Error).message, 'error'); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-medium text-slate-700 mb-3">新增钉钉消息通道</h3>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="通道名称"><Input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="如：人事钉钉工作通知" /></Field>
          <Field label="通道类型">
            <Select
              className={inputCls}
              value={channelType}
              onChange={setChannelType}
              popupMatchSelectWidth={false}
              options={[...SUPPORTED_CHANNEL_TYPE_OPTIONS]}
            />
          </Field>
          {channelType === 'work_notice' && (
            <Field label="AgentId（留空则用连接器配置）"><Input className={inputCls} value={agentId} onChange={e => setAgentId(e.target.value)} /></Field>
          )}
          {channelType === 'app_bot' && (
            <Field label="robotCode（留空则用应用级配置 / 会话自动捕获）">
              <Input className={inputCls} value={robotCode} onChange={e => setRobotCode(e.target.value)} placeholder="钉钉开放平台机器人 robotCode，如 dingxxxx" />
            </Field>
          )}
          {channelType === 'group_webhook' && (
            <>
              <Field label="Webhook URL（钉钉域名）"><Input className={inputCls} value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." /></Field>
              <Field label="加签 Secret（可选）"><Input.Password className={inputCls} value={secret} onChange={e => setSecret(e.target.value)} /></Field>
            </>
          )}
        </div>
        <Button htmlType="button" onClick={onCreate} disabled={busy} className="mt-1 h-auto rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer">创建通道</Button>
      </Card>

      <Card>
        <div className="mb-3">
          <h3 className="font-medium text-slate-700">已配置通道</h3>
          <div className="mt-3 max-w-2xl">
            <FieldBlock label="测试接收人（从员工通讯录选择）">
              <EmployeeMultiSelect employees={employees} loading={employeesLoading} selectedIds={testUserIds} onChange={setTestUserIds} />
            </FieldBlock>
          </div>
        </div>
        {channels.length === 0 ? <div className="text-slate-400 text-sm">暂无通道</div> : (
          <div className="space-y-2">
            {channels.map(c => {
              const supported = c.supported !== false;
              return (
              <div key={c.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-slate-800">{c.name}</span>
                  <span className="ml-2 text-xs text-slate-400">{c.provider}/{c.channel_type}</span>
                  {!supported && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">不支持，需迁移</span>}
                  {c.last_test_status && <span className={`ml-2 text-xs ${statusClass(c.last_test_status)}`}>最近测试：{c.last_test_status}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {supported && <Button htmlType="button" onClick={() => onTest(c)} className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer">测试发送</Button>}
                  {supported && <Button htmlType="button" onClick={() => onToggle(c)} className="h-auto border-0 p-0 text-xs text-slate-500 shadow-none hover:underline cursor-pointer">{c.enabled ? '停用' : '启用'}</Button>}
                  {!supported && c.enabled && <Button htmlType="button" onClick={() => onToggle(c)} className="h-auto border-0 p-0 text-xs text-slate-500 shadow-none hover:underline cursor-pointer">停用</Button>}
                  {!supported && <Button htmlType="button" onClick={() => onMigrate(c)} className="h-auto border-0 p-0 text-xs text-amber-700 shadow-none hover:underline cursor-pointer">迁移为钉钉工作通知</Button>}
                  <Button htmlType="button" onClick={() => onDelete(c)} className="h-auto border-0 p-0 text-xs text-red-500 shadow-none hover:underline cursor-pointer">删除</Button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── 自动化工作流 ────────────────────────────────────────────────────────

function WorkflowsSection({ show }: { show: ShowFn }) {
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const channels = useChannelStore(s => s.items).filter(c => c.supported !== false);   // 工作流只允许后端已实现的通道
  const loadChannels = useChannelStore(s => s.load);
  const [name, setName] = useState('每日打卡异常推送');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [runTime, setRunTime] = useState('09:00');
  const [weekday, setWeekday] = useState('1');
  const [monthDay, setMonthDay] = useState('1');
  const [dateWindowType, setDateWindowType] = useState('yesterday');
  const [channelId, setChannelId] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [ruleDescription, setRuleDescription] = useState(DEFAULT_RULE_TEXT);
  const [ruleConfig, setRuleConfig] = useState<Record<string, unknown> | null>(null);
  const [ruleDraftSource, setRuleDraftSource] = useState('');
  const [ruleWarnings, setRuleWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const tenantId = useAuthStore(s => s.tenantId);
  const pollingTimers = useRef<Record<string, number>>({});
  const mounted = useRef(true);
  const { employees, loading: employeesLoading } = useRecipientEmployees(show);

  const reload = () => listWorkflows().then(setWorkflows).catch(e => show(e.message, 'error'));
  useEffect(() => {
    mounted.current = true;
    reload();
    loadChannels().catch(() => {});
    listRuns()
      .then(runs => {
        runs
          .filter(run => ['pending', 'running'].includes(run.status))
          .forEach(run => startRunPolling(run.workflow_id, run.id));
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      Object.values(pollingTimers.current).forEach(window.clearTimeout);
      pollingTimers.current = {};
    };
  }, []);

  const cron = buildCronExpr(frequency, runTime, weekday, monthDay);

  function onFrequencyChange(next: 'daily' | 'weekly' | 'monthly') {
    setFrequency(next);
    setDateWindowType(current => shouldAutoSwitchDateWindow(current) ? defaultDateWindowForFrequency(next) : current);
  }

  async function generateRuleDraft(): Promise<{ config: Record<string, unknown>; source: string } | null> {
    setDraftBusy(true);
    try {
      const draft = await draftAutomationRule(ruleDescription);
      setRuleConfig(draft.rule_config);
      const suggestedWindow = dateWindowFromRule(draft.rule_config);
      if (suggestedWindow) setDateWindowType(suggestedWindow);
      setRuleDraftSource(draft.source);
      setRuleWarnings(draft.warnings || []);
      if (draft.warnings?.length) show(draft.warnings[0], 'warning');
      return { config: draft.rule_config, source: draft.source };
    } catch (e) {
      show((e as Error).message, 'error');
      return null;
    } finally {
      setDraftBusy(false);
    }
  }

  async function ensureRuleConfig(): Promise<Record<string, unknown> | null> {
    if (ruleConfig) return ruleConfig;
    const draft = await generateRuleDraft();
    return draft?.config || null;
  }

  function workflowPayload(config: Record<string, unknown>) {
    return {
      name: name.trim(),
      trigger_type: 'cron',
      cron_expr: cron,
      date_window_type: dateWindowFromRule(config) || dateWindowType,
      channel_id: channelId,
      recipient_config: { user_ids: recipients },
      rule_config: config,
    };
  }

  async function onGenerateRule() {
    setRuleConfig(null);
    const draft = await generateRuleDraft();
    if (draft) show('规则草稿已生成，请先手动测试再创建工作流', draft.source === 'fallback' ? 'warning' : 'success');
  }

  async function onCreate() {
    if (!name.trim()) return show('请填写工作流名称', 'warning');
    if (!channelId) return show('请选择消息通道', 'warning');
    if (recipients.length === 0) return show('请选择接收人', 'warning');
    const config = await ensureRuleConfig();
    if (!config) return;
    setBusy(true);
    try {
      await createWorkflow(workflowPayload(config));
      show('工作流已创建', 'success');
      reload();
    } catch (e) { show((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function onTestDraft() {
    if (!name.trim()) return show('请填写工作流名称', 'warning');
    if (!channelId) return show('请选择消息通道', 'warning');
    if (recipients.length === 0) return show('请选择测试接收人', 'warning');
    const config = await ensureRuleConfig();
    if (!config) return;
    setTestBusy(true);
    try {
      const res = await testWorkflowDraft(workflowPayload(config));
      show(`测试已执行：${res.status}（成功 ${res.run.success_count} / 失败 ${res.run.failed_count}）`, res.status === 'completed' ? 'success' : 'warning');
      reload();
    } catch (e) { show((e as Error).message, 'error'); } finally { setTestBusy(false); }
  }

  async function onRunNow(w: AutomationWorkflow) {
    if (!w.enabled) {
      notification.warning({
        message: '工作流已停用',
        description: '请先启用工作流，再执行“立即执行”。',
        duration: 5,
        closable: true,
      });
      return;
    }
    if (runningId) return;   // 防重复点击：已有执行在进行中
    const storageKey = uncertainRunStorageKey(tenantId, w.id);
    const idempotencyKey = (
      sessionStorage.getItem(storageKey)
      || globalThis.crypto.randomUUID()
    );
    sessionStorage.setItem(storageKey, idempotencyKey);
    setRunningId(w.id);
    try {
      const res = await runWorkflowNow(w.id, idempotencyKey);
      sessionStorage.removeItem(storageKey);
      if (isTerminalRun(res.run)) {
        notifyRunTerminal(res.run);
      } else {
        notification.info({
          message: '已提交执行',
          description: '任务已进入执行队列，正在等待最终结果。',
          duration: 5,
          closable: true,
        });
        startRunPolling(w.id, res.run.id);
      }
      reload();
    } catch (e) {
      const error = e as Error & { responseReceived?: boolean; status?: number };
      if (!shouldKeepUncertainRunKey(error)) {
        sessionStorage.removeItem(storageKey);
        notification.error({
          message: '提交执行失败',
          description: error.message,
          duration: 5,
          closable: true,
        });
      } else {
        notification.warning({
          message: '执行请求结果不确定',
          description: '再次点击“立即执行”将复用同一请求标识，避免重复执行。',
          duration: 5,
          closable: true,
        });
      }
    } finally { setRunningId(null); }
  }

  function isTerminalRun(run: AutomationRun) {
    return ['completed', 'failed', 'cancelled', 'partial_failed', 'blocked'].includes(run.status);
  }

  function notifyRunTerminal(run: AutomationRun) {
    const completed = run.status === 'completed';
    notification[completed ? 'success' : 'error']({
      message: completed ? '执行完成' : '执行结束',
      description: `${run.status}（成功 ${run.success_count} / 失败 ${run.failed_count}）`,
      duration: 5,
      closable: true,
    });
  }

  function startRunPolling(workflowId: string, runId: string) {
    if (pollingTimers.current[runId] !== undefined) return;
    const poll = async () => {
      if (!mounted.current) return;
      try {
        const runs = await listRuns(workflowId);
        if (!mounted.current) return;
        const current = runs.find(run => run.id === runId);
        if (current && isTerminalRun(current)) {
          delete pollingTimers.current[runId];
          notifyRunTerminal(current);
          reload();
          return;
        }
      } catch {
        // 短时查询失败不改变已确认提交状态，继续下一次轮询。
      }
      if (mounted.current) {
        pollingTimers.current[runId] = window.setTimeout(poll, 3000);
      }
    };
    pollingTimers.current[runId] = window.setTimeout(poll, 0);
  }

  async function onDelete(w: AutomationWorkflow) {
    try { await deleteWorkflow(w.id); show('已删除', 'success'); reload(); } catch (e) { show((e as Error).message, 'error'); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-medium text-slate-700 mb-3">新增自动化工作流</h3>
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="名称"><Input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="执行周期">
            <Select
              className={inputCls}
              value={frequency}
              onChange={onFrequencyChange}
              options={FREQUENCY_OPTIONS}
              popupMatchSelectWidth={false}
            />
          </Field>
          <Field label="执行时间"><Input className={inputCls} type="time" value={runTime} onChange={e => setRunTime(e.target.value)} /></Field>
          {frequency === 'weekly' && (
            <Field label="每周几执行">
              <Select className={inputCls} value={weekday} onChange={setWeekday} options={WEEKDAY_OPTIONS} popupMatchSelectWidth={false} />
            </Field>
          )}
          {frequency === 'monthly' && (
            <Field label="每月几号执行">
              <Select className={inputCls} value={monthDay} onChange={setMonthDay} options={MONTH_DAY_OPTIONS} popupMatchSelectWidth={false} />
            </Field>
          )}
          <Field label="统计/预测范围">
            <Select className={inputCls} value={dateWindowType} onChange={setDateWindowType} options={DATE_WINDOW_OPTIONS} popupMatchSelectWidth={false} />
          </Field>
          <Field label="消息通道">
            <Select
              className={inputCls}
              value={channelId}
              onChange={setChannelId}
              options={[{ value: '', label: '请选择…' }, ...channels.map(c => ({ value: c.id, label: c.name }))]}
              popupMatchSelectWidth={false}
            />
          </Field>
          <FieldBlock label="接收人（从员工通讯录选择）">
            <EmployeeMultiSelect employees={employees} loading={employeesLoading} selectedIds={recipients} onChange={setRecipients} />
          </FieldBlock>
        </div>
        <FieldBlock label="规则说明（自然语言）">
          <Input.TextArea
            className={inputCls}
            rows={5}
            value={ruleDescription}
            onChange={e => {
              setRuleDescription(e.target.value);
              setRuleConfig(null);
              setRuleDraftSource('');
              setRuleWarnings([]);
            }}
            placeholder="例如：每天早上九点推送昨天打卡异常人员，异常包含迟到、未打卡、位置异常和缺少上下班打卡；下班超过计划时间一小时标记加班。也可以写：每天晚上九点推送明天营收预测，预测净实收，并展示各门店预测。"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>系统会把说明结构化为规则，金额/人数等结果仍由后端确定性计算。</span>
            {ruleConfig && <span className="text-emerald-600">已生成 {ruleCount(ruleConfig)} 条规则</span>}
            {ruleDraftSource === 'fallback' && <span className="text-amber-600">已使用通用兜底解析</span>}
          </div>
          {ruleConfig && <RuleSummary ruleConfig={ruleConfig} />}
          {ruleWarnings.map(item => <div key={item} className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">{item}</div>)}
        </FieldBlock>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button htmlType="button" onClick={onGenerateRule} disabled={draftBusy || busy || testBusy} className="h-auto rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">生成规则草稿</Button>
          <Button htmlType="button" onClick={onTestDraft} disabled={testBusy || busy || draftBusy} className="h-auto rounded-lg border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 cursor-pointer">手动测试当前配置</Button>
          <Button htmlType="button" onClick={onCreate} disabled={busy || draftBusy || testBusy} className="h-auto rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer">创建工作流</Button>
        </div>
      </Card>

      <Card>
        <h3 className="font-medium text-slate-700 mb-3">工作流列表</h3>
        {workflows.length === 0 ? <div className="text-slate-400 text-sm">暂无工作流</div> : (
          <div className="space-y-2">
            {workflows.map(w => (
              editingId === w.id ? (
                <WorkflowEditForm
                  key={w.id}
                  workflow={w}
                  channels={channels}
                  employees={employees}
                  employeesLoading={employeesLoading}
                  show={show}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => { setEditingId(null); reload(); }}
                />
              ) : (
                <div key={w.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-800">{w.name}</span>
                    {!w.enabled && <span className="ml-2 text-xs text-slate-400">（已停用）</span>}
                    <span className="ml-2 text-xs text-slate-400">{w.cron_expr} · 下次 {w.next_run_at?.replace('T', ' ').slice(0, 16) || '—'}</span>
                    {w.last_run && <span className={`ml-2 text-xs ${statusClass(w.last_run.status)}`}>最近：{w.last_run.status}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button htmlType="button" onClick={() => setEditingId(w.id)} disabled={runningId !== null} className="h-auto border-0 p-0 text-xs text-slate-600 shadow-none hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline cursor-pointer">编辑</Button>
                    <Button
                      htmlType="button"
                      onClick={() => onRunNow(w)}
                      disabled={!w.enabled || runningId !== null}
                      title={!w.enabled ? '工作流已停用，启用后才能立即执行' : undefined}
                      className="inline-flex h-auto items-center gap-1 border-0 p-0 text-xs text-blue-600 shadow-none hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
                    >
                      {runningId === w.id && <span className="inline-block h-3 w-3 animate-spin rounded-full border border-blue-400 border-t-transparent" />}
                      {runningId === w.id ? '执行中…' : '立即执行'}
                    </Button>
                    <Button htmlType="button" onClick={() => onDelete(w)} disabled={runningId !== null} className="h-auto border-0 p-0 text-xs text-red-500 shadow-none hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline cursor-pointer">删除</Button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// 工作流编辑：规则之外的字段都可改（名称/周期/时间/范围/通道/接收人/启停）。
// 刻意不传 rule_config —— 规则在此只读展示，如需改规则请新建工作流（保存后执行不再依赖 LLM）。
function WorkflowEditForm({
  workflow, channels, employees, employeesLoading, show, onCancel, onSaved,
}: {
  workflow: AutomationWorkflow;
  channels: NotificationChannel[];
  employees: AutomationRecipientEmployee[];
  employeesLoading: boolean;
  show: ShowFn;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initCron = parseCronExpr(workflow.cron_expr);
  const initRecipients = Array.isArray((workflow.recipient_config as Record<string, unknown> | null)?.user_ids)
    ? ((workflow.recipient_config as Record<string, unknown>).user_ids as unknown[]).map(String)
    : [];
  const [name, setName] = useState(workflow.name);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>(initCron.frequency);
  const [runTime, setRunTime] = useState(initCron.runTime);
  const [weekday, setWeekday] = useState(initCron.weekday);
  const [monthDay, setMonthDay] = useState(initCron.monthDay);
  const [dateWindowType, setDateWindowType] = useState(normalizeDateWindowForFrequency(initCron.frequency, workflow.date_window_type || 'yesterday'));
  const [channelId, setChannelId] = useState(workflow.channel_id || '');
  const [recipients, setRecipients] = useState<string[]>(initRecipients);
  const [enabled, setEnabled] = useState(workflow.enabled);
  const [busy, setBusy] = useState(false);

  function onFrequencyChange(next: 'daily' | 'weekly' | 'monthly') {
    setFrequency(next);
    setDateWindowType(current => shouldAutoSwitchDateWindow(current) ? defaultDateWindowForFrequency(next) : current);
  }

  async function onSave() {
    if (!name.trim()) return show('请填写工作流名称', 'warning');
    if (!channelId) return show('请选择消息通道', 'warning');
    if (recipients.length === 0) return show('请选择接收人', 'warning');
    setBusy(true);
    try {
      await updateWorkflow(workflow.id, {
        name: name.trim(),
        cron_expr: buildCronExpr(frequency, runTime, weekday, monthDay),
        date_window_type: dateWindowType,
        channel_id: channelId,
        recipient_config: { user_ids: recipients },
        enabled,
      });
      show('工作流已更新', 'success');
      onSaved();
    } catch (e) {
      show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-3">
      <div className="mb-2 text-sm font-medium text-slate-700">编辑工作流</div>
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="名称"><Input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="执行周期">
          <Select
            className={inputCls}
            value={frequency}
            onChange={onFrequencyChange}
            options={FREQUENCY_OPTIONS}
            popupMatchSelectWidth={false}
          />
        </Field>
        <Field label="执行时间"><Input className={inputCls} type="time" value={runTime} onChange={e => setRunTime(e.target.value)} /></Field>
        {frequency === 'weekly' && (
          <Field label="每周几执行">
            <Select className={inputCls} value={weekday} onChange={setWeekday} options={WEEKDAY_OPTIONS} popupMatchSelectWidth={false} />
          </Field>
        )}
        {frequency === 'monthly' && (
          <Field label="每月几号执行">
            <Select className={inputCls} value={monthDay} onChange={setMonthDay} options={MONTH_DAY_OPTIONS} popupMatchSelectWidth={false} />
          </Field>
        )}
        <Field label="统计/预测范围">
          <Select className={inputCls} value={dateWindowType} onChange={setDateWindowType} options={DATE_WINDOW_OPTIONS} popupMatchSelectWidth={false} />
        </Field>
        <Field label="消息通道">
          <Select
            className={inputCls}
            value={channelId}
            onChange={setChannelId}
            options={[{ value: '', label: '请选择…' }, ...channels.map(c => ({ value: c.id, label: c.name }))]}
            popupMatchSelectWidth={false}
          />
        </Field>
        <Field label="状态">
          <Select
            className={inputCls}
            value={enabled ? '1' : '0'}
            onChange={(value) => setEnabled(value === '1')}
            options={[{ value: '1', label: '启用' }, { value: '0', label: '停用' }]}
            popupMatchSelectWidth={false}
          />
        </Field>
      </div>
      <FieldBlock label="接收人（从员工通讯录选择）">
        <EmployeeMultiSelect employees={employees} loading={employeesLoading} selectedIds={recipients} onChange={setRecipients} />
      </FieldBlock>
      <div className="mb-1 text-xs text-slate-400">规则在此不可修改（如需改规则请新建工作流）。当前规则：</div>
      {workflow.rule_config && <RuleSummary ruleConfig={workflow.rule_config} />}
      <div className="mt-2 flex gap-2">
        <Button htmlType="button" onClick={onSave} disabled={busy} className="h-auto rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer">保存</Button>
        <Button htmlType="button" onClick={onCancel} disabled={busy} className="h-auto rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">取消</Button>
      </div>
    </div>
  );
}

const DEFAULT_RULE_TEXT = '每天早上九点推送昨天打卡异常人员。异常包含迟到、严重迟到、旷工迟到、未打卡、位置异常、缺少上班或下班打卡；下班实际打卡时间超过计划打卡时间一小时，标记为加班并展示超出时长。';

// ── 钉钉对话入口 ────────────────────────────────────────────────────────

function BindingsSection({ show }: { show: ShowFn }) {
  const [bindings, setBindings] = useState<ExternalBinding[]>([]);
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<ExternalMessage | null>(null);
  const [externalId, setExternalId] = useState('');
  const [internalId, setInternalId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('member');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const { employees, loading: employeesLoading } = useRecipientEmployees(show);

  const reload = () => {
    listBindings().then(setBindings).catch(e => show(e.message, 'error'));
    listExternalMessages().then(setMessages).catch(() => {});
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    setUsersLoading(true);
    listUsers({ limit: 500 })
      .then(data => setUsers(data.users || []))
      .catch(e => show((e as Error).message, 'error'))
      .finally(() => setUsersLoading(false));
  }, []);

  function onExternalUserChange(id: string) {
    setExternalId(id);
    const employee = employees.find(item => item.ding_user_id === id);
    setDisplayName(employee?.name || '');
  }

  async function onCreate() {
    if (!externalId.trim() || !internalId.trim()) return show('请选择钉钉用户和系统用户', 'warning');
    try {
      await createBinding({ provider: 'dingtalk', external_user_id: externalId.trim(), internal_user_id: internalId.trim(), display_name: displayName.trim(), role_scope: { role } });
      show('绑定已创建', 'success');
      setExternalId(''); setInternalId(''); setDisplayName('');
      reload();
    } catch (e) { show((e as Error).message, 'error'); }
  }

  async function onToggle(b: ExternalBinding) {
    try { await updateBinding(b.id, { enabled: !b.enabled }); reload(); } catch (e) { show((e as Error).message, 'error'); }
  }
  async function onDelete(b: ExternalBinding) {
    try { await deleteBinding(b.id); show('已删除', 'success'); reload(); } catch (e) { show((e as Error).message, 'error'); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-medium text-slate-700 mb-1">新增钉钉用户绑定</h3>
        <p className="text-xs text-slate-400 mb-3">未绑定的钉钉用户只会收到绑定提示，不能查询业务数据。权限由角色范围确定性控制。</p>
        <div className="grid grid-cols-2 gap-x-4">
          <FieldBlock label="钉钉用户（从员工通讯录选择）">
            <EmployeeSingleSelect
              employees={employees}
              loading={employeesLoading}
              selectedId={externalId}
              onChange={onExternalUserChange}
            />
          </FieldBlock>
          <FieldBlock label="系统用户（选择要绑定的账号）">
            <SystemUserSelect
              users={users}
              loading={usersLoading}
              selectedId={internalId}
              onChange={setInternalId}
            />
          </FieldBlock>
          <Field label="显示名"><Input className={inputCls} value={displayName} onChange={e => setDisplayName(e.target.value)} /></Field>
          <Field label="角色范围">
            <Select
              className={inputCls}
              value={role}
              onChange={setRole}
              options={[{ value: 'member', label: '普通成员' }, { value: 'admin', label: '管理员' }]}
              popupMatchSelectWidth={false}
            />
          </Field>
        </div>
        <Button htmlType="button" onClick={onCreate} className="mt-1 h-auto rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer">创建绑定</Button>
      </Card>

      <Card>
        <h3 className="font-medium text-slate-700 mb-3">绑定列表</h3>
        {bindings.length === 0 ? <div className="text-slate-400 text-sm">暂无绑定</div> : (
          <div className="space-y-2">
            {bindings.map(b => (
              <div key={b.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-slate-800">{b.display_name || b.external_user_id}</span>
                  <span className="ml-2 text-xs text-slate-400">钉钉 {b.external_user_id} → 系统 {b.internal_user_id}</span>
                  {!b.enabled && <span className="ml-2 text-xs text-red-500">已停用</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button htmlType="button" onClick={() => onToggle(b)} className="h-auto border-0 p-0 text-xs text-slate-500 shadow-none hover:underline cursor-pointer">{b.enabled ? '停用' : '启用'}</Button>
                  <Button htmlType="button" onClick={() => onDelete(b)} className="h-auto border-0 p-0 text-xs text-red-500 shadow-none hover:underline cursor-pointer">删除</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium text-slate-700">对话审计（最近 200 条）</h3>
          <span className="text-xs text-slate-400">点一行看完整内容</span>
        </div>
        {messages.length === 0 ? <div className="text-slate-400 text-sm">暂无对话记录</div> : (
          <div className="space-y-1 max-h-80 overflow-y-auto text-xs">
            {messages.map(m => (
              <Button
                key={m.id}
                htmlType="button"
                onClick={() => setSelectedMessage(m)}
                className="flex h-auto w-full gap-2 rounded-none border-0 border-b border-slate-50 p-0 py-1.5 text-left shadow-none hover:bg-slate-50"
              >
                <span className={`w-10 shrink-0 ${m.direction === 'inbound' ? 'text-slate-400' : 'text-blue-500'}`}>{m.direction === 'inbound' ? '收' : '回'}</span>
                <span className="w-28 shrink-0 truncate text-slate-400">{m.external_user_id}</span>
                <span className={`w-12 shrink-0 ${statusClass(m.status)}`}>{m.status || '-'}</span>
                <span className="w-28 shrink-0 text-slate-400">{m.created_at?.replace('T', ' ').slice(0, 16) || '-'}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600">{messageSummary(m.content)}</span>
              </Button>
            ))}
          </div>
        )}
        {selectedMessage && <MessageDetailDialog message={selectedMessage} onClose={() => setSelectedMessage(null)} />}
      </Card>
    </div>
  );
}

function messageSummary(content: string | null): string {
  const text = (content || '无内容').replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function MessageDetailDialog({ message, onClose }: { message: ExternalMessage; onClose: () => void }) {
  return (
    <Modal open centered footer={null} closable={false} width="48rem" onCancel={onClose} styles={{ body: { padding: 0 } }}>
      <div className="overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">对话审计详情</h4>
            <p className="mt-1 text-xs text-slate-400">
              {message.direction === 'inbound' ? '收到' : '回复'} · {message.external_user_id} · {message.status || '-'} · {message.created_at?.replace('T', ' ').slice(0, 16) || '-'}
            </p>
          </div>
          <Button htmlType="button" onClick={onClose} className="h-auto rounded-lg border-0 px-3 py-1.5 text-sm text-slate-500 shadow-none hover:bg-slate-100">关闭</Button>
        </div>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-6 text-slate-700">{message.content || '无内容'}</pre>
      </div>
    </Modal>
  );
}

// ── 推送日志 ────────────────────────────────────────────────────────────

function formatRecipients(names: string[]): string {
  if (names.length <= 4) return names.join('、');
  return `${names.slice(0, 4).join('、')} 等 ${names.length} 人`;
}

function LogsSection({ show }: { show: ShowFn }) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  useEffect(() => { listRuns().then(setRuns).catch(e => show(e.message, 'error')); }, []);

  async function toggle(runId: string) {
    if (expanded === runId) { setExpanded(null); return; }
    setExpanded(runId);
    try { const data = await listRunDeliveries(runId); setDeliveries(data.deliveries); } catch (e) { show((e as Error).message, 'error'); }
  }

  return (
    <Card>
      <h3 className="font-medium text-slate-700 mb-3">推送执行记录</h3>
      {runs.length === 0 ? <div className="text-slate-400 text-sm">暂无执行记录</div> : (
        <div className="space-y-2">
          {runs.map(r => (
            <div key={r.id} className="border border-slate-100 rounded-lg text-sm">
              <Button htmlType="button" onClick={() => toggle(r.id)} className="flex h-auto w-full items-start justify-between border-0 px-3 py-2 text-left shadow-none cursor-pointer hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                    <span className="font-medium text-slate-700 truncate">{r.title || r.workflow_name || '推送'}</span>
                    <span className="text-xs text-slate-400">{r.run_date}</span>
                    <span className={`text-xs ${statusClass(r.status)}`}>{r.status}</span>
                    <span className="text-xs text-slate-400">命中 {r.total_count} · 成功 {r.success_count} · 失败 {r.failed_count}</span>
                  </div>
                  {r.recipient_names && r.recipient_names.length > 0 && (
                    <div className="mt-1 text-xs text-slate-500">接收：{formatRecipients(r.recipient_names)}</div>
                  )}
                </div>
                <span className="ml-3 shrink-0 text-xs text-slate-400">{expanded === r.id ? '收起' : '明细'}</span>
              </Button>
              {r.error_message && <div className="px-3 pb-2 text-xs text-amber-600">{r.error_message}</div>}
              {expanded === r.id && (
                <div className="border-t border-slate-100 px-3 py-2 space-y-1 text-xs">
                  {deliveries.length === 0 ? <div className="text-slate-400">无投递记录</div> : deliveries.map(d => (
                    <div key={d.id} className="flex gap-2">
                      <span className="w-28 shrink-0 text-slate-500">{d.recipient_name || d.external_user_id}</span>
                      <span className={`w-12 shrink-0 ${statusClass(d.status)}`}>{d.status}</span>
                      <span className="flex-1 text-slate-400 truncate">{d.error_message || (d.sent_at ? `已发 ${d.sent_at.replace('T', ' ').slice(0, 16)}` : '')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
