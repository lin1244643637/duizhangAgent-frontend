import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Table as AntdTable, type TableColumnsType } from 'antd';
import { getMappingAnalysis, getReviewData, rerunReconcile, reviewAction, type MappingAnalysis, type ReviewData } from '../api/reconcile';
import { useAuthStore } from '../store/authStore';
import { apiUrl } from '../api/url';
import { useUiStore } from '../store/uiStore';
import { TableDisplayFrame } from './TableDisplayFrame';
import { CollapsiblePanel } from './ui/CollapsiblePanel';
import { DateInput } from './ui/DateInput';
import { currentBeijingPeriod } from '../utils/time';

type TabKey = 'daily' | 'matches' | 'platform' | 'bank' | 'mapping';

function money(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
}

function text(value: unknown) {
  return value == null || value === '' ? '-' : String(value);
}

type SimpleTableRow = Record<string, string> & { __rowKey: string };
type MatchTableRow = { id: string; values: unknown[] };

function DataTable({ headers, rows, title = '表格明细' }: { headers: string[]; rows: Array<Array<unknown>>; title?: string }) {
  if (rows.length === 0) {
    return <div className="py-10 text-center text-sm text-slate-400">暂无数据</div>;
  }
  const dataSource: SimpleTableRow[] = rows.map((row, idx) => {
    const item: SimpleTableRow = { __rowKey: String(idx) };
    headers.forEach((_, cidx) => { item[`c${cidx}`] = text(row[cidx]); });
    return item;
  });
  const columns: TableColumnsType<SimpleTableRow> = headers.map((header, idx) => ({
    title: header,
    dataIndex: `c${idx}`,
    key: `c${idx}`,
    render: (value) => <span className="whitespace-nowrap text-slate-700">{value}</span>,
  }));
  return (
    <CollapsiblePanel title={title} summary={`${rows.length} 行 · ${headers.length} 列`}>
    <TableDisplayFrame title={title} filename={title} tableClassName="overflow-x-auto">
      <AntdTable<SimpleTableRow>
        rowKey="__rowKey"
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
      />
    </TableDisplayFrame>
    </CollapsiblePanel>
  );
}

export function ReconcileReviewPage() {
  const { role } = useAuthStore();
  const { reviewPeriod } = useUiStore();
  const isAdmin = role === 'admin';
  const [period, setPeriod] = useState(reviewPeriod || currentBeijingPeriod());
  const [tab, setTab] = useState<TabKey>('daily');
  const [data, setData] = useState<ReviewData | null>(null);
  const [mapping, setMapping] = useState<MappingAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('待财务复核');

  async function load(p = period) {
    setLoading(true);
    setError('');
    try {
      const [review, mappingResult] = await Promise.all([
        getReviewData(p),
        getMappingAnalysis(p),
      ]);
      setData(review);
      setMapping(mappingResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(period);
  }, []);

  async function handleAction(matchId: string, action: 'confirm' | 'ignore' | 'tag') {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await reviewAction(matchId, action, { reason, note: reason });
      setMessage('复核操作已保存');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRerun() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await rerunReconcile(period);
      setMessage(`已创建重跑任务：${result.task_id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const summary = data?.summary ?? {};
  const tabs: Array<[TabKey, string, number]> = [
    ['daily', '日差异', data?.daily.length ?? 0],
    ['matches', '待复核', data?.review_matches.length ?? 0],
    ['platform', '未匹配平台', data?.unmatched_platform.length ?? 0],
    ['bank', '未匹配银行', data?.unmatched_bank.length ?? 0],
    ['mapping', '映射问题', (mapping?.keyword_conflicts.length ?? 0) + (mapping?.transaction_conflicts.length ?? 0) + (mapping?.unmapped_bank_rows.length ?? 0)],
  ];
  const summaryCards: Array<[string, number]> = [
    ['平台', Number(summary.platform_count ?? 0)],
    ['银行', Number(summary.bank_count ?? 0)],
    ['精确', Number(summary.exact_matched ?? 0)],
    ['模糊', Number(summary.fuzzy_matched ?? 0)],
    ['待复核', Number(summary.needs_review ?? 0)],
    ['未归类银行', mapping?.unmapped_bank_rows.length ?? 0],
  ];

  const matchRows = useMemo(() => (data?.review_matches ?? []).map((row) => {
    const platform = (row.platform ?? {}) as Record<string, unknown>;
    const bank = (row.bank ?? {}) as Record<string, unknown>;
    return [
      row.status,
      row.match_type,
      platform.date,
      platform.platform,
      platform.store,
      money(platform.amount),
      bank.date,
      bank.counterparty,
      money(bank.amount),
      row.review_reason,
      row.review_note,
      row.id,
    ];
  }), [data]);
  const matchTableRows: MatchTableRow[] = matchRows.map((values) => ({ id: String(values[11]), values }));
  const matchColumns: TableColumnsType<MatchTableRow> = ['状态', '类型', '平台日期', '平台', '门店', '平台金额', '银行日期', '银行对方', '银行金额', '原因', '备注'].map((title, index) => ({
    title,
    key: String(index),
    render: (_, row) => <span className="whitespace-nowrap text-slate-700">{text(row.values[index])}</span>,
  }));
  matchColumns.push({
    title: '操作',
    key: 'actions',
    render: (_, row) => (
      isAdmin ? (
        <div className="flex gap-2">
          <Button disabled={saving} onClick={() => handleAction(row.id, 'confirm')} className="h-auto border-0 p-0 text-emerald-600 shadow-none hover:text-emerald-700 disabled:opacity-40 cursor-pointer">确认</Button>
          <Button disabled={saving} onClick={() => handleAction(row.id, 'ignore')} className="h-auto border-0 p-0 text-red-500 shadow-none hover:text-red-600 disabled:opacity-40 cursor-pointer">忽略</Button>
          <Button disabled={saving} onClick={() => handleAction(row.id, 'tag')} className="h-auto border-0 p-0 text-blue-600 shadow-none hover:text-blue-700 disabled:opacity-40 cursor-pointer">标记</Button>
        </div>
      ) : '-'
    ),
  });

  return (
    <div className="flex-1 min-w-0 bg-slate-50 overflow-y-auto">
      <div className="px-5 py-3 border-b border-slate-200 bg-white shadow-sm flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">对账复核</h2>
          <p className="text-xs text-slate-500 mt-0.5">查看差异、处理待复核记录，并在映射规则调整后重跑账期。</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-40">
            <DateInput label="账期" type="month" value={period} onChange={setPeriod} />
          </div>
          <Button onClick={() => load()} disabled={loading} className="h-auto px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer">刷新</Button>
          <a href={apiUrl(`/api/v1/reconcile/export/${period}`)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-200 text-blue-600 hover:bg-blue-50 cursor-pointer">导出</a>
          {isAdmin && (
            <Button onClick={handleRerun} disabled={saving} className="h-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 cursor-pointer">重跑</Button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</div>}

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {summaryCards.map(([label, value]) => (
            <div key={String(label)} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
              <p className="text-[11px] text-slate-400">{label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-800">{value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex gap-1 border-b border-slate-200 px-3 py-2 overflow-x-auto">
            {tabs.map(([key, label, count]) => (
              <Button
                key={key}
                onClick={() => setTab(key)}
                className={`h-auto px-3 py-1.5 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-colors ${tab === key ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {label} <span className="text-[10px] text-slate-400">{count}</span>
              </Button>
            ))}
          </div>

          <div className="p-3">
            {loading && <div className="py-10 text-center text-sm text-slate-400">加载中...</div>}
            {!loading && tab === 'daily' && (
              <DataTable
                title="日差异明细"
                headers={['日期', '平台合计', '银行合计', '差异', '平台条数', '银行条数', '状态']}
                rows={(data?.daily ?? []).map((r) => [r.date, money(r.platform_total), money(r.bank_total), money(r.diff_amount), r.platform_count, r.bank_count, r.status])}
              />
            )}
            {!loading && tab === 'matches' && (
              <div className="space-y-3">
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} className="w-72 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="复核原因/备注" />
                  </div>
                )}
                <CollapsiblePanel title="待复核匹配明细" summary={`${matchRows.length} 行`}>
                <TableDisplayFrame title="待复核匹配明细" filename="待复核匹配明细" tableClassName="overflow-x-auto">
                  <AntdTable<MatchTableRow>
                    rowKey="id"
                    columns={matchColumns}
                    dataSource={matchTableRows}
                    pagination={false}
                    size="small"
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: '暂无待复核记录' }}
                  />
                </TableDisplayFrame>
                </CollapsiblePanel>
              </div>
            )}
            {!loading && tab === 'platform' && (
              <DataTable title="未匹配平台明细" headers={['日期', '平台', '门店', '金额', '订单数', '状态']} rows={(data?.unmatched_platform ?? []).map((r) => [r.date, r.platform, r.store, money(r.amount), r.order_count, r.status])} />
            )}
            {!loading && tab === 'bank' && (
              <DataTable title="未匹配银行流水" headers={['日期', '金额', '对方户名', '摘要', '分类']} rows={(data?.unmatched_bank ?? []).map((r) => [r.date, money(r.amount), r.counterparty, r.summary, r.match_category])} />
            )}
            {!loading && tab === 'mapping' && (
              <div className="space-y-4">
                <DataTable title="映射冲突" headers={['冲突关键词', '目标平台']} rows={(mapping?.keyword_conflicts ?? []).map((r) => [r.keyword, r.target_platforms.join('、')])} />
                <DataTable title="未归类银行流水" headers={['日期', '金额', '对方户名', '摘要']} rows={(mapping?.unmapped_bank_rows ?? []).map((r) => [r.date, money(r.amount), r.counterparty, r.summary])} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
