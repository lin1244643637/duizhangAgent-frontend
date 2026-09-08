import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Input, Select, Table, type TableColumnsType } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { listUsage, listUsageTenants, type UsageRecord } from './adminApi';
import { DateInput } from '../components/ui/DateInput';
import { TableDisplayFrame } from '../components/TableDisplayFrame';
import { formatBeijingTime } from '../utils/time';
import { PlatformFilterBar } from './components/PlatformFilterBar';
import { PlatformMetricStrip } from './components/PlatformMetricStrip';
import { PlatformPageHeader } from './components/PlatformPageHeader';

function fmtDate(value: string): string {
  return formatBeijingTime(value);
}

function fmtTokens(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function AdminUsagePage() {
  const [period, setPeriod] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [username, setUsername] = useState('');
  const [model, setModel] = useState('');
  const [offset, setOffset] = useState(0);
  const [limit] = useState(100);
  const [tenants, setTenants] = useState<string[]>([]);
  const [data, setData] = useState<{ total: number; items: UsageRecord[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (nextOffset = offset) => {
    setLoading(true);
    setError('');
    try {
      const response = await listUsage({
        period: period || undefined,
        tenant_id: tenantId || undefined,
        username: username || undefined,
        model: model || undefined,
        limit,
        offset: nextOffset,
      });
      setData(response);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(offset); }, [offset]);
  useEffect(() => {
    listUsageTenants().then(setTenants).catch(() => setTenants([]));
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setOffset(0);
    void load(0);
  };

  const metrics = useMemo(() => data?.items.reduce((summary, record) => ({
    records: summary.records + 1,
    cachedInput: summary.cachedInput + record.cache_read_input_tokens + record.cache_write_input_tokens,
    uncachedInput: summary.uncachedInput + record.uncached_input_tokens,
    output: summary.output + record.output_tokens,
    estimated: summary.estimated + (record.estimated ? 1 : 0),
  }), { records: 0, cachedInput: 0, uncachedInput: 0, output: 0, estimated: 0 })
    ?? { records: 0, cachedInput: 0, uncachedInput: 0, output: 0, estimated: 0 }, [data]);

  const pageCount = data ? Math.ceil(data.total / limit) : 0;
  const columns: TableColumnsType<UsageRecord> = [
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 164, render: (value) => <span className="whitespace-nowrap text-slate-700">{fmtDate(String(value))}</span> },
    { title: '租户', dataIndex: 'tenant_id', key: 'tenant_id', width: 140, render: (value) => <span className="font-mono text-slate-700">{String(value)}</span> },
    {
      title: '用户',
      key: 'user',
      width: 130,
      render: (_, record) => record.username ?? (
        <span className="font-mono text-[10px] text-slate-400" title={record.user_id ?? ''}>
          {record.user_id ? `${record.user_id.slice(0, 8)}...` : '系统'}
        </span>
      ),
    },
    { title: 'Agent', dataIndex: 'agent', key: 'agent', width: 120, render: (value) => <span className="text-slate-700">{String(value ?? '-')}</span> },
    { title: '模型', dataIndex: 'model', key: 'model', width: 180, render: (value) => <span className="font-mono text-slate-700">{String(value)}</span> },
    { title: '命中', dataIndex: 'cache_read_input_tokens', key: 'cache_read_input_tokens', align: 'right', width: 96, render: (value) => <span className="text-slate-600">{fmtTokens(Number(value))}</span> },
    { title: '写入', dataIndex: 'cache_write_input_tokens', key: 'cache_write_input_tokens', align: 'right', width: 96, render: (value) => <span className="text-slate-600">{fmtTokens(Number(value))}</span> },
    { title: '未命中', dataIndex: 'uncached_input_tokens', key: 'uncached_input_tokens', align: 'right', width: 104, render: (value) => <span className="text-slate-600">{fmtTokens(Number(value))}</span> },
    { title: '输出', dataIndex: 'output_tokens', key: 'output_tokens', align: 'right', width: 96, render: (value) => <span className="text-slate-600">{fmtTokens(Number(value))}</span> },
    { title: '估算', dataIndex: 'estimated', key: 'estimated', align: 'center', width: 76, render: (value) => value ? <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">估算</span> : '-' },
  ];

  return (
    <div className="space-y-4">
      <PlatformPageHeader title="用量明细" description="每次 LLM 调用的真值记录，按时间倒序展示。" />
      <PlatformFilterBar resultCount={data?.total}>
        <form onSubmit={submit} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          <div className="w-36">
            <DateInput label="账期" type="month" value={period} onChange={setPeriod} />
          </div>
          <label className="block w-40">
            <span className="mb-1 block text-xs font-medium text-slate-500">租户</span>
            <Select
              aria-label="租户"
              value={tenantId || undefined}
              onChange={(value) => setTenantId(value || '')}
              options={tenants.map((tenant) => ({ value: tenant, label: tenant }))}
              placeholder="全部租户"
              allowClear
              className="w-full"
            />
          </label>
          <label className="block w-40">
            <span className="mb-1 block text-xs font-medium text-slate-500">用户名</span>
            <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="模糊匹配" />
          </label>
          <label className="block w-48">
            <span className="mb-1 block text-xs font-medium text-slate-500">模型</span>
            <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="deepseek-chat" className="font-mono" />
          </label>
          <Button htmlType="submit" type="primary" icon={<SearchOutlined aria-hidden />}>
            查询
          </Button>
        </form>
      </PlatformFilterBar>
      <PlatformMetricStrip items={[
        { label: '本页记录', value: metrics.records },
        { label: '缓存输入', value: fmtTokens(metrics.cachedInput), tone: 'success' },
        { label: '未命中输入', value: fmtTokens(metrics.uncachedInput), tone: 'warning' },
        { label: '输出 token', value: fmtTokens(metrics.output), tone: 'info' },
        { label: '估算记录', value: metrics.estimated, tone: metrics.estimated ? 'warning' : 'neutral' },
      ]} />
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">加载中...</div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">无记录</div>
        ) : (
          <TableDisplayFrame title="用量明细结果" filename="用量明细结果" tableClassName="overflow-x-auto">
            <Table<UsageRecord>
              columns={columns}
              dataSource={data.items}
              pagination={false}
              rowKey="id"
              size="small"
              scroll={{ x: 1200 }}
            />
          </TableDisplayFrame>
        )}
        {data && pageCount > 1 && (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
            <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>上一页</Button>
            <Button disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)}>下一页</Button>
          </div>
        )}
      </section>
    </div>
  );
}
