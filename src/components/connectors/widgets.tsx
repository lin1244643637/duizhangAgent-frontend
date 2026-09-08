/** ConnectorsPage 的展示型子组件（从主页面机械拆出，行为不变）。 */

import { useEffect, useId, useRef, useState, type ReactNode, type UIEvent } from 'react';
import { Alert, Button, Checkbox, ConfigProvider, DatePicker, Input, Select, Switch, TreeSelect } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import {
  saveShihengOrderAuth,
  saveConnectorIntegration,
  testShihengOrderAuth,
  testConnectorIntegration,
  type ConnectorIntegration,
  type ConnectorRecordSelectorSchema,
  type ShihengOrderAuthConfig,
  type ShihengOrderRuntime,
} from '../../api/connectors';
import { type AutomationRecipientEmployee } from '../../api/automation';
import { useEmployeeStore } from '../../store/employeeStore';
import { formatBeijingTime } from '../../utils/time';
import { PAGE_SIZE_OPTIONS, type AttendanceReportOption, type NoticeState, type NoticeVariant } from './format';

const DEPARTMENT_NODE_PREFIX = '__department__:';

export function FloatingNotice({ notice, onClose }: { notice: NoticeState; onClose: () => void }) {
  const styles: Record<NoticeVariant, { border: string; dot: string; title: string }> = {
    success: {
      border: 'border-emerald-200',
      dot: 'bg-emerald-500',
      title: 'text-emerald-700',
    },
    error: {
      border: 'border-red-200',
      dot: 'bg-red-500',
      title: 'text-red-700',
    },
    warning: {
      border: 'border-amber-200',
      dot: 'bg-amber-400',
      title: 'text-amber-700',
    },
    info: {
      border: 'border-blue-200',
      dot: 'bg-blue-500',
      title: 'text-blue-700',
    },
  };
  const style = styles[notice.variant];
  return (
    <Alert
      type={notice.variant}
      showIcon
      closable={{
        'aria-label': '关闭提示',
        closeIcon: <span className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600">关闭</span>,
        onClose,
      }}
      icon={<span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />}
      title={<div className={`min-w-0 flex-1 whitespace-pre-line text-sm leading-6 ${style.title}`}>{notice.message}</div>}
      className={`fixed right-5 top-5 z-50 w-[min(420px,calc(100vw-40px))] rounded-2xl border bg-white px-4 py-3 shadow-xl shadow-slate-900/10 ${style.border}`}
      styles={{
        root: { background: '#fff' },
        icon: { marginInlineEnd: 0 },
        section: { minWidth: 0, flex: 1 },
        close: { marginInlineStart: 0 },
      }}
    />
  );
}

export function ConnectorWorkflow({
  sourceCount,
  completedRunCount,
  scheduleCount,
}: {
  sourceCount: number;
  completedRunCount: number;
  scheduleCount: number;
}) {
  const steps = [
    {
      title: '1. 描述想获取的数据',
      desc: '用自然语言生成数据源草稿，确认名称后保存。',
      status: sourceCount > 0 ? `${sourceCount} 个数据源` : '待配置',
    },
    {
      title: '2. 测权限并手动同步',
      desc: '先测试接口权限，再同步一次数据，确认返回内容符合预期。',
      status: completedRunCount > 0 ? `${completedRunCount} 次成功同步` : '待同步',
    },
    {
      title: '3. 基于成功同步创建计划',
      desc: '只有已完成的手动同步能作为自动任务来源，避免缺参数乱跑。',
      status: scheduleCount > 0 ? `${scheduleCount} 个计划` : '待创建',
    },
  ];
  return (
    <section className="grid gap-3 md:grid-cols-3">
      {steps.map((step) => (
        <div key={step.title} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{step.title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{step.desc}</p>
            </div>
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
              {step.status}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}

export function CollapsiblePanel({
  title,
  subtitle,
  defaultOpen = true,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Button
          htmlType="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex h-auto min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border-0 text-left shadow-none outline-none hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200"
        >
          <span className="min-w-0">
            <span className="block text-base font-semibold text-slate-900">{title}</span>
            {subtitle && <span className="mt-1 block text-sm leading-5 text-slate-500">{subtitle}</span>}
          </span>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 text-sm font-semibold text-slate-500">
            {open ? '-' : '+'}
          </span>
        </Button>
        {actions && <div className="w-full sm:w-auto sm:shrink-0">{actions}</div>}
      </div>
      {open && (
        <div id={panelId} className="border-t border-slate-100 px-5 py-4">
          {children}
        </div>
      )}
    </section>
  );
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}) {
  const today = dayjs().startOf('day');

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <span className="text-xs font-semibold text-slate-500">同步区间</span>
      <ConfigProvider locale={zhCN}>
        <DatePicker.RangePicker
          key={`${startDate}:${endDate}`}
          defaultValue={[dayjs(startDate), dayjs(endDate)]}
          format="YYYY-MM-DD"
          allowClear={false}
          inputReadOnly
          needConfirm
          disabledDate={(current) => Boolean(current && !current.isBefore(today, 'day'))}
          className="w-full sm:w-[320px]"
          placeholder={['开始日期', '结束日期']}
          separator="至"
          onChange={(_, dateStrings) => {
            if (!dateStrings) return;
            const [start, end] = dateStrings;
            if (start && end) {
              onChange(start, end);
            }
          }}
        />
      </ConfigProvider>
    </div>
  );
}

export function RecordGroupSelector({
  schema,
  options,
  value,
  loading,
  hasSourceRun,
  onChange,
  columns,
  selectedColumnIds,
  onToggleColumn,
  onSelectAllColumns,
}: {
  schema: ConnectorRecordSelectorSchema;
  options: AttendanceReportOption[];
  value: string;
  loading: boolean;
  hasSourceRun: boolean;
  onChange: (value: string) => void;
  columns: { id: string; name: string }[];
  selectedColumnIds: Set<string>;
  onToggleColumn: (columnId: string) => void;
  onSelectAllColumns: () => void;
}) {
  const allSelected = selectedColumnIds.size === 0;
  const selectedCount = allSelected ? columns.length : selectedColumnIds.size;
  return (
    <label className="block rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-3">
      <span className="text-xs font-semibold text-amber-800">{schema.label || '数据分组'}</span>
      <Select
        value={value}
        onChange={onChange}
        disabled={loading || options.length === 0}
        options={[
          { value: '', label: loading ? '正在读取可选项...' : `请选择${schema.label || '数据分组'}` },
          ...options.map((option) => ({
            value: option.key,
            label: `${option.reportName} · ${option.columnCount} 个字段`,
          })),
        ]}
        popupMatchSelectWidth={false}
        className="mt-2 w-full rounded-xl border border-amber-100 bg-white text-sm text-slate-700 disabled:opacity-60"
      />
      <span className="mt-2 block text-xs leading-5 text-amber-700">
        {hasSourceRun
          ? (schema.ready_hint || '同步数据时会按这里选择的数据分组动态获取字段。')
          : (schema.missing_hint || '请先同步依赖的数据源，再回来选择具体分组。')}
      </span>
      {value && columns.length > 0 && (
        <div className="mt-3 border-t border-amber-100 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800">{schema.column_label || '需要同步的字段'}</span>
            <Button
              htmlType="button"
              onClick={onSelectAllColumns}
              disabled={allSelected}
              className="h-auto border-0 p-0 text-xs font-medium text-amber-700 shadow-none hover:text-amber-900 disabled:opacity-40"
            >
              全选
            </Button>
          </div>
          <div className="mt-2 grid max-h-40 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto">
            {columns.map((column) => (
              <Checkbox
                key={column.id}
                className="flex items-center gap-1.5 text-xs text-slate-700"
                  checked={allSelected || selectedColumnIds.has(column.id)}
                  onChange={() => onToggleColumn(column.id)}
              >
                <span className="truncate" title={column.name}>{column.name}</span>
              </Checkbox>
            ))}
          </div>
          <span className="mt-2 block text-xs leading-5 text-amber-700">
            已选 {selectedCount} / {columns.length} 列 · 同步行数 ≈ 已同步员工数 × 所选列数，只取需要的列可显著降低数据量。
          </span>
        </div>
      )}
    </label>
  );
}

export function ConnectorIntegrationCard({
  provider,
  integration,
  isAdmin,
  onSaved,
  onNotice,
  embedded = false,
}: {
  provider: string;
  integration: ConnectorIntegration | null;
  isAdmin: boolean;
  onSaved: (data: ConnectorIntegration) => void;
  onNotice: (message: string, variant: NoticeVariant) => void;
  embedded?: boolean;
}) {
  const [corpId, setCorpId] = useState(integration?.corp_id || '');
  const [agentId, setAgentId] = useState(integration?.agent_id || '');
  const [clientId, setClientId] = useState(integration?.client_id || '');
  const [clientSecret, setClientSecret] = useState('');
  const [enabled, setEnabled] = useState(integration?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCorpId(integration?.corp_id || '');
    setAgentId(integration?.agent_id || '');
    setClientId(integration?.client_id || '');
    setEnabled(integration?.enabled ?? true);
  }, [integration]);

  async function save() {
    setSaving(true);
    try {
      const data = await saveConnectorIntegration(provider, {
        corp_id: corpId, agent_id: agentId, client_id: clientId, client_secret: clientSecret, enabled,
      });
      setClientSecret('');
      onSaved(data);
      onNotice('钉钉连接已保存', 'success');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    try {
      const data = await testConnectorIntegration(provider);
      onNotice(data.message || '连接成功', 'success');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : '测试连接失败', 'error');
    }
  }

  const content = (
    <>
      {isAdmin ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="CorpId" value={corpId} onChange={setCorpId} />
            <Field label="AgentId" value={agentId} onChange={setAgentId} />
            <Field label="ClientId / AppKey" value={clientId} onChange={setClientId} />
            <Field label={integration?.configured ? 'ClientSecret / AppSecret（留空则不修改）' : 'ClientSecret / AppSecret'} value={clientSecret} onChange={setClientSecret} type="password" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
	            <Checkbox className="flex items-center gap-2 text-sm text-slate-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}>
	              启用连接
	            </Checkbox>
	            <Button htmlType="button" onClick={save} disabled={saving} className="h-auto rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40 cursor-pointer">
	              {saving ? '保存中...' : '保存配置'}
	            </Button>
	            <Button htmlType="button" onClick={test} disabled={!integration?.configured} className="h-auto rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer">
	              测试连接
	            </Button>
            {integration?.last_test_message && (
              <span className="text-xs text-slate-400">最近测试：{integration.last_test_status || '-'} · {integration.last_test_message}</span>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          {integration?.configured ? '钉钉连接已由管理员配置，可正常同步数据。' : '钉钉连接尚未配置，请联系管理员在本页完成配置。'}
        </p>
      )}
    </>
  );
  if (embedded) {
    return (
      <section className="rounded-xl border border-slate-100 bg-white px-4 py-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">钉钉连接配置</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Secret 加密保存，普通成员只能看到是否已配置。</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${integration?.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {integration?.configured ? '已配置' : '未配置'}
          </span>
        </div>
        {content}
      </section>
    );
  }
  return (
    <CollapsiblePanel
      key={integration?.configured ? 'configured' : 'unconfigured'}
      title="钉钉连接配置"
      subtitle="Secret 加密保存，普通成员只能看到是否已配置。"
      defaultOpen={!integration?.configured}
      actions={
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${integration?.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {integration?.configured ? '已配置' : '未配置'}
        </span>
      }
    >
      {content}
    </CollapsiblePanel>
  );
}

export function ShihengOrderAuthCard({
  auth,
  runtime,
  isAdmin,
  onSaved,
  onNotice,
  onRefreshRuntime,
  runtimeRefreshing = false,
  onLoadMoreRuns,
  runtimeLoadingMore = false,
  embedded = false,
}: {
  auth: ShihengOrderAuthConfig | null;
  runtime: ShihengOrderRuntime | null;
  isAdmin: boolean;
  onSaved: (data: ShihengOrderAuthConfig) => void;
  onNotice: (message: string, variant: NoticeVariant) => void;
  onRefreshRuntime?: () => void;
  runtimeRefreshing?: boolean;
  onLoadMoreRuns?: () => void;
  runtimeLoadingMore?: boolean;
  embedded?: boolean;
}) {
  const [appId, setAppId] = useState(auth?.app_id || '');
  const [appSecret, setAppSecret] = useState('');
  const [alertUserIds, setAlertUserIds] = useState<string[]>(splitIds(auth?.alert_user_ids || ''));
  const employees = useEmployeeStore(s => s.items);          // 员工通讯录走全局缓存
  const employeesLoading = useEmployeeStore(s => s.loading);
  const loadEmployees = useEmployeeStore(s => s.load);
  const [enabled, setEnabled] = useState(auth?.enabled ?? false);
  const [saving, setSaving] = useState(false);
  const configured = !!auth?.configured;

  useEffect(() => {
    setAppId(auth?.app_id || '');
    setAlertUserIds(splitIds(auth?.alert_user_ids || ''));
    setEnabled(auth?.enabled ?? false);
  }, [auth?.updated_at, auth?.configured]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    loadEmployees().catch((err) => {
      if (active) onNotice(err instanceof Error ? err.message : '加载钉钉员工通讯录失败', 'error');
    });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  async function save() {
    setSaving(true);
    try {
      const data = await saveShihengOrderAuth({
        app_id: appId,
        app_secret: appSecret,
        alert_user_ids: alertUserIds.join(','),
        enabled,
      });
      setAppSecret('');
      onSaved(data);
      onNotice('食亨订单授权已保存', 'success');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    try {
      const data = await testShihengOrderAuth();
      onNotice(data.message || '食亨订单授权可用', data.ok ? 'success' : 'warning');
    } catch (err) {
      onNotice(err instanceof Error ? err.message : '测试授权失败', 'error');
    }
  }

  const builtInSchedules = runtime?.schedule.built_in_schedules || [];
  const incrementalSchedule = builtInSchedules.find((schedule) => schedule.key === 'incremental');

  const content = (
    <>
      {isAdmin ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">AppId</span>
              <Input aria-label="AppId" value={appId} onChange={(event) => setAppId(event.target.value)} className="w-full" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">AppSecret（留空则保留）</span>
              <Input.Password aria-label="AppSecret" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} className="w-full" />
              {auth?.app_secret_hint && <span className="mt-1 block text-xs text-slate-400">已配置：{auth.app_secret_hint}</span>}
            </label>
          </div>
          <section className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-xs font-semibold text-slate-700">当前定时策略</p>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                {runtime?.schedule.timezone || 'Asia/Shanghai'}
              </span>
            </div>
            {builtInSchedules.length > 0 ? (
              <div className="mt-2 divide-y divide-slate-100 border-y border-slate-100">
                {builtInSchedules.map((schedule) => (
                  <div key={schedule.key} className="grid gap-1 py-2 text-xs leading-5 md:grid-cols-[8rem_8rem_1fr]">
                    <span className="font-medium text-slate-700">{schedule.name}</span>
                    <span className="text-slate-600">{schedule.cron_label}</span>
                    <span className="text-slate-500">{schedule.window_label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-slate-400">定时策略加载中...</p>
            )}
            <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-500 md:grid-cols-2">
              <div className="rounded-lg bg-white px-2 py-2">重复判断：{runtime?.schedule.dedupe_key || 'source_type + shop_id + order_id'}</div>
              <div className="rounded-lg bg-white px-2 py-2">更新规则：{runtime?.schedule.update_rule || '列表 hash 或状态变化时更新；状态变化时重新抓详情'}</div>
            </div>
          </section>
          <ShihengOrderRuntimeSummary
            auth={auth}
            runtime={runtime}
            configured={configured}
            incrementalScheduleLabel={incrementalSchedule?.cron_label}
          />
          <div className="mt-4">
            <span className="mb-1 block text-xs font-medium text-slate-500">异常提醒接收人</span>
            <p className="mb-2 text-xs leading-5 text-slate-400">
              AppId/AppSecret、签名或第三方接口异常时，会通知这些人员。
            </p>
            <EmployeeAlertSelect employees={employees} loading={employeesLoading} selectedIds={alertUserIds} onChange={setAlertUserIds} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
	            <span className="flex items-center gap-2 text-sm text-slate-600">
                <Switch checked={enabled} onChange={setEnabled} />
	              启用定时同步
	            </span>
	            <Button htmlType="button" onClick={save} disabled={saving} className="h-auto rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40 cursor-pointer">
	              {saving ? '保存中...' : '保存配置'}
	            </Button>
	            <Button htmlType="button" onClick={test} disabled={!configured} className="h-auto rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer">
	              测试连接
	            </Button>
            {auth?.last_test_message && (
              <span className="text-xs text-slate-400">最近状态：{auth.last_test_status || '-'} · {auth.last_test_message}</span>
            )}
          </div>
          <ShihengOrderRunList
            runtime={runtime}
            onRefresh={onRefreshRuntime}
            refreshing={runtimeRefreshing}
            onLoadMore={onLoadMoreRuns}
            loadingMore={runtimeLoadingMore}
          />
        </>
      ) : (
        <p className="text-sm text-slate-500">
          {configured ? '食亨订单授权已由管理员配置，定时任务可自动抓取订单。' : '食亨订单授权尚未配置，请联系管理员更新。'}
        </p>
      )}
    </>
  );
  const statusLabel = configured && !auth?.enabled
    ? auth?.auth_mode === 'legacy' && auth.legacy_configured ? '旧授权已停用' : '开放接口已停用'
    : auth?.auth_mode === 'legacy' && auth.legacy_configured ? '旧授权待迁移'
    : auth?.auth_mode === 'openapi' && auth.openapi_configured ? '开放接口已启用'
    : '未配置';
  const statusBadge = (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${configured && auth?.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
      {statusLabel}
    </span>
  );
  if (embedded) {
    return (
      <section className="rounded-xl border border-slate-100 bg-white px-4 py-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">食亨订单授权</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">AppSecret 加密保存，定时同步优先读取这里的配置。</p>
          </div>
          {statusBadge}
        </div>
        {content}
      </section>
    );
  }
  return (
    <CollapsiblePanel
      title="食亨订单授权"
      subtitle="AppSecret 加密保存，定时同步优先读取这里的配置。"
      defaultOpen={!configured}
      actions={statusBadge}
    >
      {content}
    </CollapsiblePanel>
  );
}

function ShihengOrderRuntimeSummary({
  auth,
  runtime,
  configured,
  incrementalScheduleLabel,
}: {
  auth: ShihengOrderAuthConfig | null;
  runtime: ShihengOrderRuntime | null;
  configured: boolean;
  incrementalScheduleLabel?: string;
}) {
  const runs = runtime?.runs || [];
  const runningRun = runs.find((run) => run.status === 'running');
  const latestCompleted = runs.find((run) => run.status === 'completed' && run.finished_at);
  const latestFailed = runs.find((run) => run.status === 'failed');
  const statusText = runningRun
    ? '执行中'
    : auth?.enabled && configured && latestCompleted
      ? '已启用，最近执行成功'
      : auth?.enabled && configured
        ? '已启用，等待下次执行'
        : configured
          ? '已停用'
          : '未配置';
  const statusClass = runningRun
    ? 'bg-amber-50 text-amber-700'
    : auth?.enabled && configured
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-slate-100 text-slate-500';

  return (
    <section className="mt-4 rounded-xl border border-slate-100 bg-white px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">定时任务运行状态</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}>{statusText}</span>
      </div>
      <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-500 md:grid-cols-3">
        <div className="rounded-lg bg-slate-50 px-2 py-2">
          <span className="block text-slate-400">上次抓取完成</span>
          <span className="font-medium text-slate-700">{latestCompleted?.finished_at ? formatBeijingTime(latestCompleted.finished_at) : '-'}</span>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-2">
          <span className="block text-slate-400">增量派发规则</span>
          <span className="font-medium text-slate-700">{auth?.enabled && configured ? incrementalScheduleLabel || '-' : '-'}</span>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-2">
          <span className="block text-slate-400">最近异常</span>
          <span className={latestFailed ? 'font-medium text-amber-700' : 'font-medium text-slate-700'}>
            {latestFailed ? `${latestFailed.started_at ? formatBeijingTime(latestFailed.started_at) : '-'} · ${latestFailed.error_code || 'failed'}` : '暂无'}
          </span>
        </div>
      </div>
    </section>
  );
}

function ShihengOrderRunList({
  runtime,
  onRefresh,
  refreshing = false,
  onLoadMore,
  loadingMore = false,
}: {
  runtime: ShihengOrderRuntime | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  const runs = runtime?.runs || [];
  const hasMore = Boolean(runtime?.runs_page?.has_more);
  const requestedRef = useRef(false);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (!onLoadMore || loadingMore || !hasMore) return;
    const target = event.currentTarget;
    const reachedBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 24;
    if (!reachedBottom) {
      requestedRef.current = false;
      return;
    }
    if (requestedRef.current) return;
    requestedRef.current = true;
    onLoadMore();
  }

  useEffect(() => {
    if (!loadingMore) requestedRef.current = false;
  }, [loadingMore, runs.length]);

  return (
    <section className="mt-4 rounded-xl border border-slate-100 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <p className="text-xs font-semibold text-slate-700">最近任务日志</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">已加载 {runs.length} 条</span>
          {onRefresh && (
            <Button htmlType="button" onClick={onRefresh} disabled={refreshing} className="h-auto rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {refreshing ? '刷新中...' : '刷新'}
            </Button>
          )}
        </div>
      </div>
      {runs.length === 0 ? (
        <p className="px-3 py-4 text-sm text-slate-400">暂无食亨订单抓取记录</p>
      ) : (
        <div aria-label="最近任务日志" className="max-h-72 overflow-auto" onScroll={handleScroll}>
          {runs.map((run) => (
            <div key={run.id} className="border-b border-slate-50 px-3 py-2 text-xs last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-slate-700">{run.source_type === 'takeout' ? '外卖订单' : '店内订单'}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{run.run_kind === 'incremental' ? '增量' : run.run_kind === 'backfill' ? '回扫' : '手动'}</span>
                <span className={run.status === 'completed' ? 'text-emerald-600' : run.status === 'failed' ? 'text-red-500' : 'text-amber-600'}>{run.status}</span>
                <span className="text-slate-400">{run.started_at ? formatBeijingTime(run.started_at) : '-'}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-500">
                <span>列表 {run.list_count}</span><span>新增 {run.inserted_count}</span><span>更新 {run.updated_count}</span>
                <span>详情成功 {run.detail_success_count}</span><span>详情跳过 {run.detail_skipped_count}</span><span>详情失败 {run.detail_failed_count}</span>
              </div>
              {run.error_message && <p className="mt-1 text-amber-600">{run.error_message}</p>}
            </div>
          ))}
          {(loadingMore || hasMore) && <div className="px-3 py-2 text-center text-[11px] text-slate-400">{loadingMore ? '加载中...' : '下拉到底部加载更多'}</div>}
        </div>
      )}
    </section>
  );
}

function EmployeeAlertSelect({
  employees,
  loading,
  selectedIds,
  onChange,
}: {
  employees: AutomationRecipientEmployee[];
  loading: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  if (loading) {
    return <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-400">正在加载钉钉员工通讯录...</div>;
  }
  if (employees.length === 0) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">暂无可选人员。请先同步钉钉员工通讯录。</div>;
  }
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
  const treeData = departmentOptions.map((department) => {
    const items = groupedEmployees[department] || [];
    return {
      title: `${department}（${items.length}人）`,
      label: department,
      value: `${DEPARTMENT_NODE_PREFIX}${department}`,
      key: `${DEPARTMENT_NODE_PREFIX}${department}`,
      searchText: department,
      children: items.map((employee) => ({
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
        searchText: [employee.name, employee.ding_user_id, employee.position, ...employeeDepartments(employee)].filter(Boolean).join(' ').toLowerCase(),
      })),
    };
  });
  const selectedEmployees = selectedIds.map((id) => employees.find((employee) => employee.ding_user_id === id)).filter(Boolean) as AutomationRecipientEmployee[];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <TreeSelect
        className="w-full"
        value={selectedIds}
        onChange={(value: string | string[]) => onChange((Array.isArray(value) ? value : value ? [value] : []).filter((item) => !item.startsWith(DEPARTMENT_NODE_PREFIX)))}
        treeData={treeData}
        treeCheckable
        showSearch={{
          treeNodeFilterProp: 'searchText',
          filterTreeNode: (input, node) => {
            const data = node as { searchText?: string; label?: string; value?: string };
            return [data.searchText, data.label, data.value].filter(Boolean).join(' ').toLowerCase().includes(input.trim().toLowerCase());
          },
        }}
        allowClear
        multiple
        treeNodeLabelProp="label"
        showCheckedStrategy={TreeSelect.SHOW_CHILD}
        placeholder="搜索姓名、部门、职位或 userId"
        maxTagCount="responsive"
        listHeight={320}
        popupMatchSelectWidth={420}
        treeDefaultExpandedKeys={departmentOptions.slice(0, 1).map((department) => `${DEPARTMENT_NODE_PREFIX}${department}`)}
        notFoundContent="没有匹配的员工"
        onClear={() => onChange([])}
      />
      <div className="mt-2 text-xs leading-5 text-slate-400">
        {selectedEmployees.length === 0 ? (
          <span>未选择提醒人员</span>
        ) : (
          <span>已选择提醒人员：{selectedEmployees.map((employee) => employee.name).join('、')}</span>
        )}
      </div>
    </div>
  );
}

function splitIds(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function employeeDepartments(employee: AutomationRecipientEmployee): string[] {
  return employee.department_names?.length ? employee.department_names : ['未分配部门'];
}

function primaryDepartment(employee: AutomationRecipientEmployee): string {
  return employeeDepartments(employee)[0] || '未分配部门';
}

export function Field({
  label,
  value,
  onChange,
  type,
  help,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  help?: ReactNode;
  placeholder?: string;
}) {
  const helpId = useId();
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {label}
        {help && (
          <span className="group relative inline-flex">
            <span
              tabIndex={0}
              role="button"
              aria-label={`${label} 参数说明`}
              aria-describedby={helpId}
              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold leading-none text-slate-500 outline-none transition hover:text-blue-600 focus:border-blue-400 focus:text-blue-700 focus:ring-2 focus:ring-blue-100"
            >
              ?
            </span>
            <span
              id={helpId}
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-6 z-30 hidden w-72 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-normal leading-5 text-slate-600 shadow-xl shadow-slate-900/10 group-hover:block group-focus-within:block"
            >
              {help}
            </span>
          </span>
        )}
      </span>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
    </label>
  );
}

export function HelpBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-3">
      <p className="text-xs font-semibold text-blue-800">{title}</p>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-blue-700">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

export function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
      <span>共 {total} 条，第 {page} / {totalPages} 页</span>
      <div className="flex items-center gap-2">
        <span>每页</span>
        <Select
          value={pageSize}
          onChange={onPageSizeChange}
          options={PAGE_SIZE_OPTIONS.map((size) => ({ value: size, label: size }))}
          popupMatchSelectWidth={false}
          className="min-w-16 rounded-lg border border-slate-200 bg-white"
        />
        <Button
          htmlType="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="h-auto rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-40"
        >
          上一页
        </Button>
        <Button
          htmlType="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="h-auto rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-40"
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
