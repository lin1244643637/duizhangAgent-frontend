import { lazy, Suspense, useEffect, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select } from 'antd';
import { detectRevenueAlerts, getRevenueAlertSettings, getRevenueAlerts, saveRevenueAlertSettings, type RevenueAlert, type RevenueAlertInterpretation, type RevenueAlertPrimaryCause, type RevenueAlertSettings } from '../../api/analytics';
import { createWorkflow, listWorkflows, updateWorkflow, type AutomationWorkflow } from '../../api/automation';
import { useChannelStore } from '../../store/channelStore';
import { useEmployeeStore } from '../../store/employeeStore';
import { EmployeeMultiSelect } from '../EmployeeMultiSelect';
import { ChartFullscreenLayer, FullscreenFilterButton, useAnalyticsChartFullscreen } from './ChartFullscreen';
import {
  Card, FUTURE_DATE_MESSAGE, MobileDatePopup, MobileInlineFilter, daysAgo, inputCls, isFutureDate, searchableSelectProps, shiftAnchor, ymd, yuan,
} from './shared';

const RevenueAlertChart = lazy(() => import('./RevenueAlertChart').then(module => ({ default: module.RevenueAlertChart })));

function RevenueAlertPrimaryCauseView({ value }: { value: RevenueAlertPrimaryCause }) {
  const dataQuality = value.classification === 'data_quality';
  const structured = Boolean(
    value.primary_evidence
    || value.recommended_action
    || value.impact_signals?.length
    || value.context_signals?.length,
  );
  return (
    <section className={`border-l-2 px-3 py-2 ${dataQuality ? 'border-amber-400 bg-amber-50/60' : 'border-blue-400 bg-white/50'}`}>
      <div className="text-xs font-medium text-slate-700">主要判断{dataQuality ? ' · 待核查' : ''}</div>
      <p className="mt-1 break-words text-xs leading-5 text-slate-600">{value.summary}</p>
      {value.primary_evidence ? (
        <p className="mt-1 break-words text-xs leading-5 text-slate-500">主要依据：{value.primary_evidence}</p>
      ) : !structured && value.supporting_signals.length > 0 ? (
        <p className="mt-1 break-words text-xs leading-5 text-slate-500">依据：{value.supporting_signals.join('；')}</p>
      ) : null}
      {value.recommended_action ? (
        <p className="mt-1 break-words text-xs leading-5 text-slate-600">建议动作：{value.recommended_action}</p>
      ) : null}
    </section>
  );
}

function RevenueAlertInterpretationView({ value }: { value: RevenueAlertInterpretation }) {
  if (value.status !== 'ready') return null;
  return (
    <section className="mt-2 border-l-2 border-violet-400 bg-white/50 px-3 py-2">
      <div className="text-xs font-medium text-slate-700">AI 经营解读</div>
      {value.summary ? <p className="mt-1 break-words text-xs leading-5 text-slate-600">{value.summary}</p> : null}
      {value.priority_action ? <p className="mt-1 break-words text-xs leading-5 text-slate-600">优先动作：{value.priority_action}</p> : null}
      {value.uncertainties?.length ? <p className="mt-1 break-words text-xs leading-5 text-slate-500">待确认：{value.uncertainties.join('；')}</p> : null}
    </section>
  );
}

function RevenueAlertSettingsModal({
  initialSettings,
  onSaved,
  onClose,
  show,
}: {
  initialSettings: RevenueAlertSettings;
  onSaved: (settings: RevenueAlertSettings) => void;
  onClose: () => void;
  show: (m: string) => void;
}) {
  const emps = useEmployeeStore(s => s.items);
  const empsLoading = useEmployeeStore(s => s.loading);
  const loadEmps = useEmployeeStore(s => s.load);
  const channels = useChannelStore(s => s.items);
  const loadChannels = useChannelStore(s => s.load);
  const [thresholdPercent, setThresholdPercent] = useState(String(Math.round((initialSettings.threshold_pct || 0.1) * 100)));
  const [recipientIds, setRecipientIds] = useState<string[]>(initialSettings.recipient_user_ids || []);
  const [enablePush, setEnablePush] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [pushTime, setPushTime] = useState('09:00');
  const [alertWorkflow, setAlertWorkflow] = useState<AutomationWorkflow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadEmps().catch(e => show((e as Error).message));
    loadChannels().then(items => { if (items[0]) setChannelId(items[0].id); }).catch(e => show((e as Error).message));
    listWorkflows().then(items => {
      const existing = items.find(item => item.rule_config?.type === 'revenue_alert') || null;
      if (!existing) return;
      setAlertWorkflow(existing);
      setEnablePush(Boolean(existing.enabled));
      setChannelId(existing.channel_id || '');
      const [minute = '0', hour = '9'] = String(existing.cron_expr || '0 9 * * *').split(' ');
      setPushTime(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }).catch(e => show((e as Error).message));
  }, []);

  const submit = () => {
    const parsed = Number(thresholdPercent);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
      show('偏离阈值必须大于 0 且不超过 100');
      return;
    }
    if (enablePush && !channelId) {
      show('请选择自动推送消息通道');
      return;
    }
    if (enablePush && recipientIds.length === 0) {
      show('请选择报警接收人');
      return;
    }
    const [hour, minute] = pushTime.split(':').map(Number);
    const workflowPayload = {
      name: '每日营收报警推送',
      workflow_type: 'notification',
      trigger_type: 'cron',
      cron_expr: `${minute || 0} ${hour || 9} * * *`,
      timezone: 'Asia/Shanghai',
      date_window_type: 'yesterday',
      enabled: enablePush,
      channel_id: channelId || null,
      recipient_config: { user_ids: recipientIds },
      rule_config: { type: 'revenue_alert' },
    };
    setBusy(true);
    saveRevenueAlertSettings({
      threshold_pct: parsed / 100,
      recipient_user_ids: recipientIds,
    }).then(async settings => {
      if (enablePush || alertWorkflow) {
        const savedWorkflow = alertWorkflow
          ? await updateWorkflow(alertWorkflow.id, workflowPayload)
          : await createWorkflow(workflowPayload);
        setAlertWorkflow(savedWorkflow);
      }
      onSaved(settings);
      show(enablePush ? '营收报警设置和自动推送已保存' : '营收报警设置已保存');
      onClose();
    }).catch(e => show((e as Error).message)).finally(() => setBusy(false));
  };

  return (
    <Modal open centered footer={null} closable={false} width="34rem" onCancel={onClose} styles={{ body: { padding: 0 } }}>
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-slate-800">营收报警设置</h3>
            <p className="mt-1 text-xs text-slate-400">阈值和接收人按当前租户保存。后续自动推送会使用这里的接收范围。</p>
          </div>
          <Button autoInsertSpace={false} htmlType="button" className="h-auto rounded-lg border-0 px-2 py-1 text-sm text-slate-400 shadow-none hover:bg-slate-100 hover:text-slate-600 cursor-pointer" onClick={onClose}>关闭</Button>
        </div>
        <label className="block text-sm">
          <span className="text-slate-500">偏离阈值</span>
          <div className="mt-1 flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max="100"
              step="1"
              className={inputCls + ' w-28'}
              value={thresholdPercent}
              onChange={e => setThresholdPercent(e.target.value)}
            />
            <span className="text-sm text-slate-500">%</span>
            <span className="text-xs text-slate-400">默认 10%，即偏离超过 10% 触发报警。</span>
          </div>
        </label>
        <div className="block text-sm">
          <div className="mb-1 text-slate-500">报警接收人（从员工通讯录选择）</div>
          <EmployeeMultiSelect employees={emps} loading={empsLoading} selectedIds={recipientIds} onChange={setRecipientIds} />
        </div>
        <div className="rounded-lg border border-slate-200 p-3 space-y-3">
	          <Checkbox className="flex items-center gap-2 text-sm text-slate-600" checked={enablePush} onChange={e => setEnablePush(e.target.checked)}>
	            启用每日自动推送
	          </Checkbox>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-500">推送时间</span>
	              <Input type="time" className={inputCls + ' w-full mt-1'} value={pushTime} onChange={e => setPushTime(e.target.value)} disabled={!enablePush} />
            </label>
            <label className="block text-sm">
              <span className="text-slate-500">消息通道</span>
		              <Select
		                {...searchableSelectProps}
		                className={inputCls + ' w-full mt-1'}
	                value={channelId}
	                onChange={setChannelId}
	                disabled={!enablePush}
	                options={channels.length === 0
	                  ? [{ value: '', label: '（无通道，请先在自动化与消息里创建）' }]
	                  : channels.map(channel => ({ value: channel.id, label: channel.name }))}
	                popupMatchSelectWidth={false}
	              />
            </label>
          </div>
          <p className="text-xs text-slate-400">每日按“昨天”检测营收偏离；没有命中报警时不会发送消息，只在推送日志中记录未推送原因。</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
		          <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 px-3 py-1.5 text-sm text-slate-500 shadow-none hover:text-slate-700 cursor-pointer" onClick={onClose}>取消</Button>
		          <Button autoInsertSpace={false} htmlType="button" className="h-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer" disabled={busy} onClick={submit}>{busy ? '保存中…' : '保存设置'}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function AlertsSection({ show, canManage }: { show: (m: string) => void; canManage: boolean }) {
  const [alerts, setAlerts] = useState<RevenueAlert[]>([]);
  const [settings, setSettings] = useState<RevenueAlertSettings | null>(null);
  const [day, setDay] = useState(ymd(shiftAnchor('day', new Date(), -1)));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [fullscreenFilterExpanded, setFullscreenFilterExpanded] = useState(false);
  const { fullscreenChart, fullscreenPortrait, openFullscreen, closeFullscreen } = useAnalyticsChartFullscreen<'revenue-alerts'>();

  const loadAlerts = (businessDate = day) => {
    if (isFutureDate(businessDate)) {
      show(FUTURE_DATE_MESSAGE);
      return;
    }
    setLoading(true);
    getRevenueAlerts(businessDate).then(setAlerts).catch(e => show((e as Error).message)).finally(() => setLoading(false));
  };
  const setDayIfAllowed = (value: string) => {
    if (isFutureDate(value)) {
      show(FUTURE_DATE_MESSAGE);
      return;
    }
    setDay(value);
  };

  useEffect(() => {
    getRevenueAlertSettings().then(setSettings).catch(e => show((e as Error).message));
  }, []);
  useEffect(() => { loadAlerts(day); /* eslint-disable-next-line */ }, [day]);

  const detect = () => {
    if (isFutureDate(day)) {
      show(FUTURE_DATE_MESSAGE);
      return;
    }
    setBusy(true);
    detectRevenueAlerts(day).then(r => { setAlerts(r.alerts); show(`检测完成，命中 ${r.detected} 条`); }).catch(e => show((e as Error).message)).finally(() => setBusy(false));
  };
  useEffect(() => {
    if (!fullscreenChart) setFullscreenFilterExpanded(false);
  }, [fullscreenChart]);
  const thresholdText = `${Math.round(((settings?.threshold_pct ?? 0.1) * 100))}%`;
  const recipientCount = settings?.recipient_user_ids?.length ?? 0;
  const priorityAlerts = [...alerts].sort((a, b) => Math.abs(b.deviation_pct) - Math.abs(a.deviation_pct)).slice(0, 3);
  const lastSelectableDate = daysAgo(1);
  const renderControls = (mobile = false) => (
    <>
      {mobile ? (
        <MobileDatePopup
          label="检测日"
          title="选择报警检测日"
          value={day}
          onChange={setDayIfAllowed}
        />
      ) : (
        <Input aria-label="选择报警检测日" type="date" max={lastSelectableDate} className={`${inputCls} flex-none`} style={{ width: 160 }} value={day} onChange={e => setDayIfAllowed(e.target.value)} />
      )}
      {canManage && <Button autoInsertSpace={false} htmlType="button" className={`h-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer ${mobile ? 'w-full' : ''}`} onClick={() => setSettingsOpen(true)}>报警设置</Button>}
      {canManage && <Button autoInsertSpace={false} htmlType="button" className={`h-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer ${mobile ? 'w-full' : ''}`} disabled={busy} onClick={detect}>{busy ? '检测中…' : '检测'}</Button>}
    </>
  );

  return (
    <Card>
      <MobileInlineFilter
        summary={`${day} · 阈值 ${thresholdText}`}
        open={filterExpanded}
        onToggle={() => setFilterExpanded(v => !v)}
      >
        {renderControls(true)}
      </MobileInlineFilter>
      <div className="mb-3 hidden flex-wrap items-center gap-2 md:flex">
        <span className="text-sm font-medium text-slate-700">营收报警</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">阈值 {thresholdText}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">接收人 {recipientCount} 人</span>
        <span className="ml-auto text-xs text-slate-400">检测日</span>
        {renderControls(false)}
      </div>
      <p className="text-xs text-slate-400 mb-3">基线 = 过去 4 周同星期净实收均值；偏离超过 {thresholdText} 报警。数据积累越多越准。</p>
      {alerts.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2">
            <div className="text-sm font-medium text-slate-800">报警偏离率</div>
            <div className="mt-1 text-xs text-slate-400">按偏离绝对值排序，红色偏低，绿色偏高</div>
          </div>
          <Suspense fallback={<div className="flex h-[18rem] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">图表加载中…</div>}>
            <RevenueAlertChart alerts={alerts} onFullscreen={() => openFullscreen('revenue-alerts')} />
          </Suspense>
        </div>
      )}
      {fullscreenChart === 'revenue-alerts' ? (
        <ChartFullscreenLayer
          title="报警偏离率"
          subtitle={`${day} · 阈值 ${thresholdText}`}
          showRotateHint={fullscreenPortrait}
          controls={(
            <div className="relative">
              <FullscreenFilterButton
                expanded={fullscreenFilterExpanded}
                onClick={() => setFullscreenFilterExpanded(v => !v)}
              />
              {fullscreenFilterExpanded ? (
                <div className="chart-fullscreen-filter-panel">
                  <div className="mb-1.5 truncate text-[11px] text-slate-400">{day} · 阈值 {thresholdText}</div>
                  <div className="space-y-2">{renderControls(true)}</div>
                </div>
              ) : null}
            </div>
          )}
          onClose={closeFullscreen}
        >
          {alerts.length > 0 ? (
            <Suspense fallback={<div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">图表加载中…</div>}>
              <RevenueAlertChart alerts={alerts} fullscreen />
            </Suspense>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">暂无报警数据</div>
          )}
        </ChartFullscreenLayer>
      ) : null}
      {alerts.length === 0 ? <div className="text-slate-400 text-sm py-8 text-center">{loading ? '加载中…' : '暂无报警'}</div> : (
        <div className="space-y-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs font-medium text-slate-600">优先处理 Top {priorityAlerts.length}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {priorityAlerts.map(a => (
                <span key={`${a.business_date}-${a.shop_key}`} className={`rounded-full px-2 py-1 text-xs ${a.direction === 'under' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {a.shop_label} · {a.direction === 'under' ? '偏低' : '偏高'} {(Math.abs(a.deviation_pct) * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </div>
          {alerts.map((a, i) => {
            const primaryCause = a.primary_cause;
            const impactSignals = primaryCause?.impact_signals || [];
            const contextSignals = primaryCause?.context_signals || [];
            const hasStructuredCause = Boolean(
              primaryCause
              && (primaryCause.primary_evidence || impactSignals.length || contextSignals.length),
            );
            return (
            <div key={i} className={`rounded-lg px-3 py-2 text-sm ${a.direction === 'under' ? 'bg-red-50' : 'bg-emerald-50'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={a.direction === 'under' ? 'text-red-600' : 'text-emerald-600'}>{a.direction === 'under' ? '▼ 明显偏低' : '▲ 明显偏高'}</span>
                <span className="min-w-0 break-words text-slate-700">{a.shop_label}</span>
                <span className="text-slate-400 text-xs">{a.business_date}</span>
                <span className="min-w-0 break-words text-slate-600 md:ml-auto">实际净实收 {yuan(a.actual_amount)} · 基线 {yuan(a.baseline_amount)} · 偏离 {(a.deviation_pct * 100).toFixed(0)}%</span>
              </div>
              {(a.primary_cause || a.ai_interpretation || a.reason_hints?.length || a.baseline_sample_count != null) ? (
                <div className="mt-2 border-t border-white/70 pt-2">
                  {a.primary_cause ? <RevenueAlertPrimaryCauseView value={a.primary_cause} /> : null}
                  {a.ai_interpretation?.status === 'ready' ? <RevenueAlertInterpretationView value={a.ai_interpretation} /> : null}
                  {a.ai_interpretation?.status === 'pending' ? <p className="mt-2 text-xs text-slate-400">AI 解读生成中</p> : null}
                </div>
              ) : null}
              <details className="mt-2 text-xs text-slate-500" open>
                <summary className="cursor-pointer font-medium text-slate-500">辅助证据与线索</summary>
                {hasStructuredCause || a.reason_hints?.length || a.baseline_sample_count != null ? (
                  <div className="mt-1 space-y-1 break-words leading-5">
                    {a.baseline_sample_count != null && a.baseline_expected_count != null && (
                      <div>基线样本：{a.baseline_sample_count}/{a.baseline_expected_count} 个历史同星期样本</div>
                    )}
                    {hasStructuredCause ? (
                      <>
                        {impactSignals.length > 0 ? (
                          <div>
                            <div className="font-medium text-slate-600">影响拆分</div>
                            {impactSignals.map((signal, idx) => <div key={`impact-${idx}`}>{signal}</div>)}
                          </div>
                        ) : null}
                        {contextSignals.length > 0 ? (
                          <div>
                            <div className="font-medium text-slate-600">背景线索</div>
                            {contextSignals.map((signal, idx) => <div key={`context-${idx}`}>{signal}</div>)}
                          </div>
                        ) : null}
                      </>
                    ) : a.reason_hints?.map((hint, idx) => (
                      <div key={idx}>可能原因：{hint}</div>
                    ))}
                  </div>
                ) : <p className="mt-1 break-words text-slate-400">暂无额外线索</p>}
              </details>
            </div>
            );
          })}
        </div>
      )}
      {canManage && settingsOpen && (
        <RevenueAlertSettingsModal
          initialSettings={settings || { threshold_pct: 0.1, recipient_user_ids: [] }}
          onSaved={setSettings}
          onClose={() => setSettingsOpen(false)}
          show={show}
        />
      )}
    </Card>
  );
}

// ── 产品（P3）──────────────────────────────────────────────────────────────
