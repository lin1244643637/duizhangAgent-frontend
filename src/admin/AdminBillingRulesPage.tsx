import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Input, Table, type TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  listActiveRules,
  listRulesHistory,
  upsertRule,
  type BillingRule,
} from './adminApi';
import { formatBeijingTime } from '../utils/time';
import { PlatformDetailDrawer } from './components/PlatformDetailDrawer';
import { PlatformPageHeader } from './components/PlatformPageHeader';
import { PlatformStatusTag } from './components/PlatformStatusTag';

function fmtDate(value: string): string {
  return formatBeijingTime(value);
}

function rate(value: string): string {
  return `¥${value}`;
}

export function AdminBillingRulesPage() {
  const [rules, setRules] = useState<BillingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<BillingRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [historyOf, setHistoryOf] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRules(await listActiveRules());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const columns: TableColumnsType<BillingRule> = [
    {
      title: '模型规则',
      dataIndex: 'model_pattern',
      key: 'model_pattern',
      width: 220,
      render: (value) => <span className="font-mono text-slate-800">{String(value)}</span>,
    },
    { title: '缓存命中', dataIndex: 'cache_hit_rate_per_m_yuan', key: 'cache_hit_rate_per_m_yuan', width: 132, align: 'right', render: (value) => rate(String(value)) },
    { title: '缓存写入', dataIndex: 'cache_write_rate_per_m_yuan', key: 'cache_write_rate_per_m_yuan', width: 132, align: 'right', render: (value) => rate(String(value)) },
    { title: '未命中输入', dataIndex: 'cache_miss_rate_per_m_yuan', key: 'cache_miss_rate_per_m_yuan', width: 132, align: 'right', render: (value) => rate(String(value)) },
    { title: '输出', dataIndex: 'output_rate_per_m_yuan', key: 'output_rate_per_m_yuan', width: 120, align: 'right', render: (value) => rate(String(value)) },
    { title: '生效时间', dataIndex: 'effective_from', key: 'effective_from', width: 164, render: (value) => fmtDate(String(value)) },
    { title: '状态', key: 'status', width: 96, render: () => <PlatformStatusTag label="当前生效" tone="success" /> },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, rule) => (
        <div className="flex items-center gap-1">
          <Button type="link" onClick={() => setHistoryOf(rule.model_pattern)}>查看历史版本</Button>
          <Button type="link" onClick={() => setEditing(rule)}>编辑</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PlatformPageHeader
        title="计费规则"
        description="按模型维护每百万 token 的版本化费率；保存新规则不会改写历史账单。"
        primaryAction={(
          <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => setCreating(true)}>
            新增规则
          </Button>
        )}
      />
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <Table<BillingRule>
          columns={columns}
          dataSource={rules}
          loading={loading}
          locale={{ emptyText: '暂无规则' }}
          pagination={false}
          rowKey="id"
          size="small"
          scroll={{ x: 1120 }}
        />
      </section>
      <RuleEditDrawer
        initial={editing}
        open={Boolean(editing || creating)}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={async () => {
          setEditing(null);
          setCreating(false);
          await load();
        }}
      />
      <HistoryDrawer modelPattern={historyOf} onClose={() => setHistoryOf(null)} />
    </div>
  );
}

function RuleEditDrawer({
  initial,
  open,
  onClose,
  onSaved,
}: {
  initial: BillingRule | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pattern, setPattern] = useState('');
  const [hit, setHit] = useState('0.02');
  const [write, setWrite] = useState('1.25');
  const [miss, setMiss] = useState('1');
  const [out, setOut] = useState('2');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPattern(initial?.model_pattern ?? '');
    setHit(initial?.cache_hit_rate_per_m_yuan ?? '0.02');
    setWrite(initial?.cache_write_rate_per_m_yuan ?? '1.25');
    setMiss(initial?.cache_miss_rate_per_m_yuan ?? '1');
    setOut(initial?.output_rate_per_m_yuan ?? '2');
    setError('');
  }, [initial, open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await upsertRule({
        model_pattern: pattern.trim(),
        cache_hit_rate_per_m_yuan: hit,
        cache_write_rate_per_m_yuan: write,
        cache_miss_rate_per_m_yuan: miss,
        output_rate_per_m_yuan: out,
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlatformDetailDrawer
      open={open}
      title={initial ? '编辑规则' : '新增规则'}
      onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" htmlType="submit" form="billing-rule-form" disabled={saving || !pattern.trim()}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      )}
    >
      <form id="billing-rule-form" onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          保存会新增一条规则，并关闭同一模型规则的当前版本；历史账单不会受影响。
        </div>
        <Field label="模型规则（支持 fnmatch 通配符 * ?）">
          <Input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder="claude-* / deepseek-chat / *"
            disabled={Boolean(initial)}
            required
            className="font-mono"
          />
          {initial && <span className="mt-1 block text-xs text-slate-500">模型规则不可改；如需换规则，请新增一条。</span>}
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="缓存命中（元 / 百万 token）"><NumberInput value={hit} onChange={setHit} /></Field>
          <Field label="缓存写入（元 / 百万 token）"><NumberInput value={write} onChange={setWrite} /></Field>
          <Field label="未命中输入（元 / 百万 token）"><NumberInput value={miss} onChange={setMiss} /></Field>
          <Field label="输出（元 / 百万 token）"><NumberInput value={out} onChange={setOut} /></Field>
        </div>
        {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      </form>
    </PlatformDetailDrawer>
  );
}

function NumberInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Input
      type="number"
      step="0.0001"
      min="0"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required
      className="font-mono"
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function HistoryDrawer({ modelPattern, onClose }: { modelPattern: string | null; onClose: () => void }) {
  const [rows, setRows] = useState<BillingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!modelPattern) return;
    setLoading(true);
    setError('');
    void listRulesHistory(modelPattern)
      .then((history) => setRows([...history].sort((left, right) => right.effective_from.localeCompare(left.effective_from))))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [modelPattern]);

  const columns: TableColumnsType<BillingRule> = useMemo(() => [
    { title: '状态', key: 'status', width: 96, render: (_, rule) => <PlatformStatusTag label={rule.effective_to ? '已关闭' : '当前生效'} tone={rule.effective_to ? 'neutral' : 'success'} /> },
    { title: '开始生效', dataIndex: 'effective_from', key: 'effective_from', width: 164, render: (value) => fmtDate(String(value)) },
    { title: '结束时间', dataIndex: 'effective_to', key: 'effective_to', width: 164, render: (value) => value ? fmtDate(String(value)) : '至今' },
    { title: '缓存命中', dataIndex: 'cache_hit_rate_per_m_yuan', key: 'cache_hit_rate_per_m_yuan', align: 'right', width: 120, render: (value) => rate(String(value)) },
    { title: '缓存写入', dataIndex: 'cache_write_rate_per_m_yuan', key: 'cache_write_rate_per_m_yuan', align: 'right', width: 120, render: (value) => rate(String(value)) },
    { title: '未命中输入', dataIndex: 'cache_miss_rate_per_m_yuan', key: 'cache_miss_rate_per_m_yuan', align: 'right', width: 120, render: (value) => rate(String(value)) },
    { title: '输出', dataIndex: 'output_rate_per_m_yuan', key: 'output_rate_per_m_yuan', align: 'right', width: 100, render: (value) => rate(String(value)) },
  ], []);

  return (
    <PlatformDetailDrawer open={Boolean(modelPattern)} title="历史版本" onClose={onClose} width={760}>
      <div className="space-y-4">
        <div>
          <div className="text-xs text-slate-500">模型规则</div>
          <div className="mt-1 font-mono text-sm text-slate-800">{modelPattern}</div>
        </div>
        {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <Table<BillingRule>
          columns={columns}
          dataSource={rows}
          loading={loading}
          locale={{ emptyText: '无历史记录' }}
          pagination={false}
          rowKey="id"
          size="small"
          scroll={{ x: 920 }}
        />
      </div>
    </PlatformDetailDrawer>
  );
}
