import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Button, Collapse, DatePicker, Form, Input, InputNumber, Modal, Select, Table, notification, type TableColumnsType } from 'antd';
import { listStoreScopeTree } from '../../api/analytics';
import { getProfitLineVersions, getStaffingRuleVersions, saveProfitLine, saveStaffingRule } from '../../api/analyticsDecision';
import type { ProfitLine, ProfitLineInput, ProfitLineVersions, StaffingRule, StaffingRuleInput, StaffingRuleVersions } from '../../types/analyticsDecision';
import { currentBeijingDate } from '../../utils/time';
import type { StoreScopeNode } from './storeScope';
import { EnterpriseProfilePanel } from './EnterpriseProfilePanel';
import { inputCls } from './shared';

type StoreOption = { key: string; label: string };
type ProfitLineDraft = Omit<ProfitLineInput, 'store_key'>;
type StaffingDraft = Omit<StaffingRuleInput, 'store_key'> & { efficiency_metric: 'revenue' | 'orders'; efficiency_value: string };

const initialProfitLineDraft = (): ProfitLineDraft => ({
  effective_date: currentBeijingDate(), net_income_line: '', enabled: true, reason: '',
});

const initialStaffingDraft = (): StaffingDraft => ({
  meal_period: 'lunch', role_code: '', role_name: '', minimum_headcount: 0, allocation_weight: '',
  target_revenue_per_labor_hour: null, orders_per_labor_hour: null, effective_date: currentBeijingDate(), enabled: true,
  efficiency_metric: 'revenue', efficiency_value: '',
});

function actualStores(nodes: StoreScopeNode[]): StoreOption[] {
  const seen = new Set<string>();
  const visit = (node: StoreScopeNode): StoreOption[] => {
    if (node.type === 'store' && node.store_key && !seen.has(node.store_key)) {
      seen.add(node.store_key);
      return [{ key: node.store_key, label: node.label }];
    }
    return (node.children || []).flatMap(visit);
  };
  return nodes.flatMap(visit);
}

function notificationOptions(message: string, description: string) {
  return { message, description, duration: 5, closable: true };
}

export function DecisionSettingsPanel() {
  const [notice, noticeHolder] = notification.useNotification();
  const [modal, modalHolder] = Modal.useModal();
  const mounted = useRef(false);
  const selectedStore = useRef<string | null>(null);
  const versionRequest = useRef(0);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeKey, setStoreKey] = useState<string | null>(null);
  const [scopeLoading, setScopeLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [versionsLoadedFor, setVersionsLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [profitLines, setProfitLines] = useState<ProfitLineVersions>({ current: null, next: null, versions: [] });
  const [staffingRules, setStaffingRules] = useState<StaffingRuleVersions>({ current: [], versions: [] });
  const [profitLineDraft, setProfitLineDraft] = useState<ProfitLineDraft>(initialProfitLineDraft);
  const [staffingDraft, setStaffingDraft] = useState<StaffingDraft>(initialStaffingDraft);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      versionRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setScopeLoading(true);
    listStoreScopeTree()
      .then((tree) => {
        if (!active) return;
        const nextStores = actualStores(tree.nodes || []);
        setStores(nextStores);
        setStoreKey(nextStores[0]?.key || null);
      })
      .catch((error) => active && notice.error(notificationOptions('加载门店失败', (error as Error).message)))
      .finally(() => { if (active) setScopeLoading(false); });
    return () => { active = false; };
  }, [notice]);

  const loadVersions = async (nextStoreKey: string) => {
    if (!mounted.current || selectedStore.current !== nextStoreKey) return;
    const requestId = ++versionRequest.current;
    setVersionsLoadedFor(null);
    setProfitLines({ current: null, next: null, versions: [] });
    setStaffingRules({ current: [], versions: [] });
    setLoading(true);
    try {
      const [profit, staffing] = await Promise.all([
        getProfitLineVersions(nextStoreKey),
        getStaffingRuleVersions(nextStoreKey),
      ]);
      if (!mounted.current || requestId !== versionRequest.current || selectedStore.current !== nextStoreKey) return;
      setProfitLines(profit);
      setStaffingRules(staffing);
      setVersionsLoadedFor(nextStoreKey);
    } catch (error) {
      if (mounted.current && requestId === versionRequest.current && selectedStore.current === nextStoreKey) {
        notice.error(notificationOptions('加载经营决策规则失败', (error as Error).message));
      }
    } finally {
      if (mounted.current && requestId === versionRequest.current && selectedStore.current === nextStoreKey) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    selectedStore.current = storeKey;
    if (storeKey) void loadVersions(storeKey);
  }, [storeKey]);

  const storeOptions = useMemo(() => stores.map((store) => ({ value: store.key, label: store.label })), [stores]);
  const profitColumns: TableColumnsType<ProfitLine> = [
    { title: '生效日', dataIndex: 'effective_date', width: 110 },
    { title: '净收入盈利线', dataIndex: 'net_income_line', render: (value) => <span className="tabular-nums">{value}</span> },
    { title: '状态', dataIndex: 'enabled', width: 72, render: (value) => value ? '启用' : '停用' },
  ];
  const staffingColumns: TableColumnsType<StaffingRule> = [
    { title: '餐段/岗位', key: 'role', render: (_, row) => `${row.meal_period} / ${row.role_name || row.role_code}` },
    { title: '最低人数', dataIndex: 'minimum_headcount', width: 88 },
    { title: '人效口径', key: 'efficiency', render: (_, row) => row.target_revenue_per_labor_hour || row.orders_per_labor_hour || '—' },
    { title: '生效日', dataIndex: 'effective_date', width: 110 },
  ];

  const notifySaveError = (error: unknown) => {
    const status = (error as { status?: number }).status;
    const sessionExpired = error instanceof Error && error.message === '登录已过期，请重新登录';
    if (status === 409) {
      notice.error(notificationOptions('保存冲突', '该生效日已有规则，请选择新的生效日后重试。'));
    } else if (status === 401 || status === 403 || sessionExpired) {
      notice.error(notificationOptions('无权限保存', '仅管理员可修改经营决策规则。'));
    } else {
      notice.error(notificationOptions('保存失败', (error as Error).message));
    }
  };

  const saveProfit = async () => {
    if (!storeKey || !profitLineDraft.net_income_line) return;
    setSaving(true);
    try {
      await saveProfitLine({ store_key: storeKey, ...profitLineDraft });
      if (!mounted.current) return;
      notice.success(notificationOptions('盈利线已保存', '历史记录已刷新。'));
      await loadVersions(storeKey);
    } catch (error) {
      if (mounted.current) notifySaveError(error);
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const onSaveProfit = () => {
    if (profitLines.versions.some((item) => item.effective_date === profitLineDraft.effective_date)) {
      modal.confirm({
        title: '确认同一生效日保存？',
        content: '后端不会覆盖历史版本；如发生冲突，请改用新的生效日。',
        okText: '确认保存',
        cancelText: '取消',
        onOk: saveProfit,
      });
      return;
    }
    void saveProfit();
  };

  const saveStaffing = async () => {
    if (!storeKey || !staffingDraft.role_code || !staffingDraft.efficiency_value) return;
    setSaving(true);
    const { efficiency_metric, efficiency_value, ...draft } = staffingDraft;
    try {
      await saveStaffingRule({
        store_key: storeKey,
        ...draft,
        allocation_weight: draft.allocation_weight || null,
        target_revenue_per_labor_hour: efficiency_metric === 'revenue' ? efficiency_value : null,
        orders_per_labor_hour: efficiency_metric === 'orders' ? efficiency_value : null,
      });
      if (!mounted.current) return;
      notice.success(notificationOptions('排班规则已保存', '历史记录已刷新。'));
      await loadVersions(storeKey);
    } catch (error) {
      if (mounted.current) notifySaveError(error);
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const onSaveStaffing = () => {
    const hasSameVersion = staffingRules.versions.some((item) => (
      item.effective_date === staffingDraft.effective_date
      && item.meal_period === staffingDraft.meal_period
      && item.role_code === staffingDraft.role_code
    ));
    if (hasSameVersion) {
      modal.confirm({
        title: '确认同一生效日保存？',
        content: '后端不会覆盖历史版本；如发生冲突，请改用新的生效日。',
        okText: '确认保存',
        cancelText: '取消',
        onOk: saveStaffing,
      });
      return;
    }
    void saveStaffing();
  };

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-5" aria-labelledby="decision-settings-title">
      {noticeHolder}
      {modalHolder}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="decision-settings-title" className="font-medium text-slate-700 mb-1">经营决策规则</h3>
          <p className="text-xs text-slate-400">按门店维护净收入盈利线和排班基线。</p>
        </div>
        <Select
          aria-label="经营决策门店"
          className="min-w-40"
          value={storeKey}
          options={storeOptions}
          loading={scopeLoading}
          disabled={!scopeLoading && stores.length === 0}
          placeholder={scopeLoading ? '加载门店…' : '暂无可配置门店'}
          onChange={setStoreKey}
        />
      </div>
      <Collapse
        className="border-0 bg-transparent"
        activeKey={expanded}
        onChange={(keys) => setExpanded(Array.isArray(keys) ? keys : [keys])}
        items={[
          {
            key: 'enterprise-profile',
            label: '企业画像',
            children: <EnterpriseProfilePanel />,
          },
          {
            key: 'profit-line',
            label: '盈利线',
            children: (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <span>当前生效金额：<strong className="font-medium text-slate-700 tabular-nums">{profitLines.current?.net_income_line || '—'}</strong></span>
                  <span>下一版本生效日：<strong className="font-medium text-slate-700">{profitLines.next?.effective_date || '—'}</strong></span>
                </div>
                <Form component={false}>
                  <div className="flex flex-wrap items-end gap-2">
                    <Form.Item label="生效日" className="mb-0">
                      <DatePicker aria-label="盈利线生效日" value={dayjs(profitLineDraft.effective_date)} allowClear={false} format="YYYY-MM-DD" onChange={(value) => setProfitLineDraft((draft) => ({ ...draft, effective_date: value?.format('YYYY-MM-DD') || '' }))} />
                    </Form.Item>
                    <Form.Item label="金额" className="mb-0">
                      <InputNumber aria-label="盈利线金额" stringMode min="0" precision={2} className="w-32" value={profitLineDraft.net_income_line} onChange={(value) => setProfitLineDraft((draft) => ({ ...draft, net_income_line: value == null ? '' : String(value) }))} />
                    </Form.Item>
                    <Form.Item label="备注" className="mb-0 flex-1 min-w-40">
                      <Input aria-label="盈利线备注" className={inputCls} value={profitLineDraft.reason} onChange={(event) => setProfitLineDraft((draft) => ({ ...draft, reason: event.target.value }))} />
                    </Form.Item>
                    <Button type="primary" htmlType="button" loading={saving} disabled={!storeKey || versionsLoadedFor !== storeKey || !profitLineDraft.net_income_line} onClick={onSaveProfit}>保存盈利线</Button>
                  </div>
                </Form>
                <Table<ProfitLine> size="small" pagination={false} rowKey="id" loading={loading} columns={profitColumns} dataSource={profitLines.versions} locale={{ emptyText: '暂无盈利线历史' }} />
              </div>
            ),
          },
          {
            key: 'staffing',
            label: '排班规则',
            children: (
              <div className="space-y-3 pt-1">
                <Form component={false}>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Form.Item label="餐段" className="mb-0"><Select aria-label="排班餐段" value={staffingDraft.meal_period} onChange={(value) => setStaffingDraft((draft) => ({ ...draft, meal_period: value }))} options={[['breakfast', '早餐'], ['lunch', '午餐'], ['afternoon_tea', '下午茶'], ['dinner', '晚餐'], ['late_night', '夜宵']].map(([value, label]) => ({ value, label }))} /></Form.Item>
                    <Form.Item label="岗位编码" className="mb-0"><Input aria-label="岗位编码" className={inputCls} value={staffingDraft.role_code} onChange={(event) => setStaffingDraft((draft) => ({ ...draft, role_code: event.target.value }))} /></Form.Item>
                    <Form.Item label="岗位名称" className="mb-0"><Input aria-label="岗位名称" className={inputCls} value={staffingDraft.role_name || ''} onChange={(event) => setStaffingDraft((draft) => ({ ...draft, role_name: event.target.value }))} /></Form.Item>
                    <Form.Item label="最低人数" className="mb-0"><InputNumber aria-label="最低人数" min={0} precision={0} value={staffingDraft.minimum_headcount} onChange={(value) => setStaffingDraft((draft) => ({ ...draft, minimum_headcount: Number(value || 0) }))} /></Form.Item>
                    <Form.Item label="分配权重" className="mb-0"><InputNumber aria-label="分配权重" stringMode min="0" precision={4} value={staffingDraft.allocation_weight || ''} onChange={(value) => setStaffingDraft((draft) => ({ ...draft, allocation_weight: value == null ? '' : String(value) }))} /></Form.Item>
                    <Form.Item label="人效口径" className="mb-0"><Select aria-label="人效口径" value={staffingDraft.efficiency_metric} onChange={(value) => setStaffingDraft((draft) => ({ ...draft, efficiency_metric: value }))} options={[{ value: 'revenue', label: '营收/工时' }, { value: 'orders', label: '单量/工时' }]} /></Form.Item>
                    <Form.Item label="人效值" className="mb-0"><InputNumber aria-label="人效值" stringMode min="0" value={staffingDraft.efficiency_value} onChange={(value) => setStaffingDraft((draft) => ({ ...draft, efficiency_value: value == null ? '' : String(value) }))} /></Form.Item>
                    <Form.Item label="生效日" className="mb-0"><DatePicker aria-label="排班生效日" value={dayjs(staffingDraft.effective_date)} allowClear={false} format="YYYY-MM-DD" onChange={(value) => setStaffingDraft((draft) => ({ ...draft, effective_date: value?.format('YYYY-MM-DD') || '' }))} /></Form.Item>
                    <div className="flex items-end"><Button htmlType="button" type="primary" loading={saving} disabled={!storeKey || versionsLoadedFor !== storeKey || !staffingDraft.role_code || !staffingDraft.efficiency_value} onClick={onSaveStaffing}>保存排班规则</Button></div>
                  </div>
                </Form>
                <Table<StaffingRule> size="small" pagination={false} rowKey="id" loading={loading} columns={staffingColumns} dataSource={staffingRules.versions} locale={{ emptyText: '暂无排班规则历史' }} />
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}
