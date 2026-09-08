import { ReloadOutlined } from '@ant-design/icons';
import { Button, Segmented, Select, Table, type TableColumnsType } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { AdminTenant } from '../types';
import { formatBeijingTime } from '../utils/time';
import { listPlatformTasks, listPlatformTenants, type PlatformTaskItem } from './adminApi';
import { PlatformDetailDrawer } from './components/PlatformDetailDrawer';
import { PlatformFilterBar } from './components/PlatformFilterBar';
import { PlatformPageHeader } from './components/PlatformPageHeader';
import { PlatformStatusTag, type PlatformStatusTone } from './components/PlatformStatusTag';
import { PaginationControls } from './PaginationControls';

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  file_parsing: '文件解析',
  reconciliation: '对账',
  report_generation: '报表生成',
  hr_sync: '人事同步',
  connector_sync: '连接器同步',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  running: '进行中',
  completed: '已完成',
  failed: '失败',
};

const STATUS_TONES: Record<string, PlatformStatusTone> = {
  pending: 'neutral',
  running: 'info',
  completed: 'success',
  failed: 'error',
};

function taskMessage(task: PlatformTaskItem) {
  return String(task.meta?.agent_message || task.meta?.error || task.meta?.message || '无错误摘要');
}

export function PlatformTaskLogsPage() {
  const [tasks, setTasks] = useState<PlatformTaskItem[]>([]);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState('');
  const [status, setStatus] = useState('failed');
  const [taskType, setTaskType] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PlatformTaskItem | null>(null);

  useEffect(() => {
    listPlatformTenants({ limit: 200 }).then((data) => setTenants(data.tenants)).catch(() => {});
  }, []);

  async function fetchTasks() {
    setLoading(true);
    setError('');
    try {
      const data = await listPlatformTasks({
        tenant_id: tenantId || undefined,
        status: status || undefined,
        task_type: taskType || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setTasks(data.tasks);
      setTotal(data.total);
      setSelected((previous) => previous && data.tasks.some((task) => task.id === previous.id) ? previous : null);
    } catch (err) {
      setTasks([]);
      setTotal(0);
      setSelected(null);
      setError(err instanceof Error ? err.message : '加载任务失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchTasks();
  }, [tenantId, status, taskType, page]);

  const tenantNameMap = useMemo(() => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant.brand_name])), [tenants]);

  const columns: TableColumnsType<PlatformTaskItem> = [
    {
      title: '租户',
      dataIndex: 'tenant_id',
      key: 'tenant',
      width: 180,
      render: (value) => <span className="text-slate-700">{tenantNameMap[String(value)] ?? String(value)}</span>,
    },
    {
      title: '任务类型',
      dataIndex: 'task_type',
      key: 'task_type',
      width: 132,
      render: (value) => TYPE_LABELS[String(value)] ?? String(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 108,
      render: (value) => <PlatformStatusTag label={STATUS_LABELS[String(value)] ?? String(value)} tone={STATUS_TONES[String(value)] ?? 'neutral'} />,
    },
    {
      title: '错误摘要',
      key: 'message',
      ellipsis: true,
      render: (_, task) => <span className="text-slate-600">{taskMessage(task)}</span>,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 138,
      render: (value) => value ? formatBeijingTime(String(value), { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 96,
      fixed: 'right',
      render: (_, task) => (
        <Button
          type="link"
          onClick={(event) => {
            event.stopPropagation();
            setSelected(task);
          }}
        >
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PlatformPageHeader title="任务日志" description="查看跨租户任务运行状态和失败原因。" />
      <PlatformFilterBar
        resultCount={total}
        actions={(
          <Button
            aria-label="刷新任务列表"
            icon={<ReloadOutlined aria-hidden />}
            onClick={() => void fetchTasks()}
          />
        )}
      >
        <Segmented
          aria-label="任务状态"
          value={status}
          onChange={(value) => {
            setStatus(String(value));
            setPage(0);
          }}
          options={[
            { value: 'failed', label: '失败' },
            { value: 'running', label: '进行中' },
            { value: 'pending', label: '等待中' },
            { value: 'completed', label: '已完成' },
            { value: '', label: '全部' },
          ]}
        />
        <Select
          allowClear
          aria-label="筛选租户"
          placeholder="全部租户"
          value={tenantId || undefined}
          onChange={(value) => {
            setTenantId(value || '');
            setPage(0);
          }}
          options={tenants.map((tenant) => ({ value: tenant.id, label: tenant.brand_name }))}
          className="w-40"
        />
        <Select
          allowClear
          aria-label="任务类型"
          placeholder="全部任务类型"
          value={taskType || undefined}
          onChange={(value) => {
            setTaskType(value || '');
            setPage(0);
          }}
          options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          className="w-36"
        />
      </PlatformFilterBar>
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <Table<PlatformTaskItem>
          columns={columns}
          dataSource={tasks}
          loading={loading}
          locale={{ emptyText: '暂无任务' }}
          pagination={false}
          rowKey="id"
          size="small"
          scroll={{ x: 960 }}
          onRow={(task) => ({
            onClick: () => setSelected(task),
            className: 'cursor-pointer',
          })}
        />
        <PaginationControls page={page} pageSize={PAGE_SIZE} total={total} loading={loading} onPageChange={setPage} />
      </section>
      <PlatformDetailDrawer
        open={selected !== null}
        title={selected ? `${TYPE_LABELS[selected.task_type] ?? selected.task_type} · 任务详情` : '任务详情'}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="space-y-5 text-sm">
            <dl className="grid grid-cols-2 gap-4">
              <DetailField label="租户" value={tenantNameMap[selected.tenant_id] ?? selected.tenant_id} />
              <DetailField label="任务类型" value={TYPE_LABELS[selected.task_type] ?? selected.task_type} />
              <DetailField label="状态" value={STATUS_LABELS[selected.status] ?? selected.status} />
              <DetailField label="任务 ID" value={selected.task_id ?? selected.id} mono />
              <DetailField label="Celery ID" value={selected.celery_task_id ?? '-'} mono />
              <DetailField label="创建时间" value={selected.created_at ? formatBeijingTime(selected.created_at) : '-'} />
              <DetailField label="更新时间" value={selected.updated_at ? formatBeijingTime(selected.updated_at) : '-'} />
            </dl>
            <section>
              <h2 className="text-xs font-medium text-slate-500">错误摘要</h2>
              <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">{taskMessage(selected)}</p>
            </section>
            <section>
              <h2 className="text-xs font-medium text-slate-500">完整 Meta</h2>
              <pre className="mt-1 max-h-80 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                {JSON.stringify(selected.meta ?? {}, null, 2)}
              </pre>
            </section>
          </div>
        )}
      </PlatformDetailDrawer>
    </div>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 break-all text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
