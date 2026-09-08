import { useEffect, useMemo, useState } from 'react';
import { Button, Select, Table, type TableColumnsType } from 'antd';
import * as XLSX from 'xlsx';
import { apiFetch } from '../api/client';
import { getConnectorSyncRunRecords, type ConnectorRecordTable } from '../api/connectors';
import { GLOBAL_TASK_POLL_SCOPE, useTaskStore } from '../store/taskStore';
import { TASK_RUN_STATUS_LABELS, taskRunStatus, type TaskRecord } from '../types/task';
import { TableDisplayFrame } from './TableDisplayFrame';
import { CollapsiblePanel } from './ui/CollapsiblePanel';
import { downloadFile } from '../utils/downloadFile';
import { formatBeijingTime } from '../utils/time';
import { useTaskStage } from '../utils/taskStage';

const LABELS: Record<string, string> = {
  file_parsing: '文件解析',
  reconciliation: '对账',
  finance_report: '财务报表',
  salary_report: '工资表',
  connector_sync: '连接器同步',
  research: 'Research Agent',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  retrying: '重试中',
  completed: '已完成',
  failed: '失败',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  running: 'bg-blue-50 text-blue-700 border-blue-200',
  retrying: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type PreviewSheet = {
  name: string;
  rows: string[][];
};

function metaOf(task: TaskRecord | null): Record<string, unknown> {
  return (task?.meta || {}) as Record<string, unknown>;
}

function downloadInfo(task: TaskRecord | null): { url: string; filename: string } | null {
  if (!task) return null;
  const meta = metaOf(task);
  if ((task.task_type === 'finance_report' || task.task_type === 'salary_report') && typeof meta.download_url === 'string') {
    return {
      url: meta.download_url,
      filename: typeof meta.filename === 'string' ? meta.filename : task.task_type === 'salary_report' ? '工资表.xlsx' : '财务报表.xlsx',
    };
  }
  if (task.task_type === 'reconciliation' && task.status === 'completed' && typeof meta.period === 'string') {
    return {
      url: `/api/v1/reconcile/export/${encodeURIComponent(meta.period)}`,
      filename: `reconcile_${meta.period.replace('-', '_')}.xlsx`,
    };
  }
  return null;
}

function formatTime(value: string) {
  if (!value) return '—';
  return formatBeijingTime(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function visibleMetaEntries(meta: Record<string, unknown>) {
  const hidden = new Set(['download_url', 'artifact_id', 'stage']);
  return Object.entries(meta).filter(([key]) => !hidden.has(key));
}

function renderValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

const TASKS_PAGE_POLL_OWNER = 'tasks-page';

export function TasksPage() {
  const { tasks, selectedTaskId, startPolling, stopPolling } = useTaskStore();
  const [preview, setPreview] = useState<PreviewSheet[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [taskFilter, setTaskFilter] = useState<'all' | 'finance' | 'reconcile'>('all');

  const visibleTasks = useMemo(
    () => tasks.filter((task) => {
      if (task.task_type === 'file_parsing') return false;
      if (taskFilter === 'finance') return task.task_type === 'finance_report' || task.task_type === 'salary_report';
      if (taskFilter === 'reconcile') return task.task_type === 'reconciliation';
      return true;
    }),
    [tasks, taskFilter],
  );
  const selectedTask = visibleTasks.find((task) => task.task_id === selectedTaskId) ?? visibleTasks[0] ?? null;
  const file = downloadInfo(selectedTask);
  const meta = metaOf(selectedTask);
  const { stage, elapsed } = useTaskStage(selectedTask);
  const runStatus = selectedTask ? taskRunStatus(selectedTask) : null;

  useEffect(() => {
    startPolling(TASKS_PAGE_POLL_OWNER, GLOBAL_TASK_POLL_SCOPE);
    return () => stopPolling(TASKS_PAGE_POLL_OWNER);
  }, [startPolling, stopPolling]);

  useEffect(() => {
    setPreview(null);
    setPreviewError('');
  }, [selectedTask?.task_id]);

  async function loadPreview() {
    if (!file) return;
    setPreviewing(true);
    setPreviewError('');
    try {
      const res = await apiFetch(file.url);
      if (!res.ok) throw new Error('文件读取失败');
      const arrayBuffer = await res.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheets = workbook.SheetNames.slice(0, 3).map((name) => {
        const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], {
          header: 1,
          blankrows: false,
          defval: '',
        });
        return {
          name,
          rows: rows.slice(0, 40).map((row) => row.slice(0, 12).map((cell) => String(cell ?? ''))),
        };
      });
      setPreview(sheets);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : '预览失败');
    } finally {
      setPreviewing(false);
    }
  }

  if (!selectedTask) {
    return (
      <main className="flex-1 overflow-y-auto bg-slate-50 p-3 md:p-8">
        <TaskFilterTabs value={taskFilter} onChange={setTaskFilter} />
        <div className="mx-auto flex min-h-[16rem] max-w-3xl items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-400 md:h-full">
          暂无可查看任务
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-6xl px-3 py-4 md:px-8 md:py-8">
        <TaskFilterTabs value={taskFilter} onChange={setTaskFilter} />
        <header className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
          <div>
            <p className="text-xs font-medium text-slate-400">任务详情</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 md:text-2xl">
              {typeof meta.task_name === 'string' ? meta.task_name : (LABELS[selectedTask.task_type] ?? selectedTask.task_type)}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              创建于 {formatTime(selectedTask.created_at)}，最后更新 {formatTime(selectedTask.updated_at)}
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[runStatus ?? selectedTask.status] ?? STATUS_STYLES.pending}`}>
            {selectedTask.task_type === 'research' && runStatus && runStatus in TASK_RUN_STATUS_LABELS
              ? TASK_RUN_STATUS_LABELS[runStatus as keyof typeof TASK_RUN_STATUS_LABELS]
              : STATUS_LABELS[runStatus ?? selectedTask.status] ?? runStatus ?? selectedTask.status}
          </span>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-5">
          <section className="space-y-4 md:space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-800">输出结果</h2>
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
                  自动刷新
                </span>
              </div>
              {stage ? (
                <div className="mt-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-700">{stage.label}</p>
                  <p className="mt-1 text-slate-500">{stage.detail}</p>
                  <p
                    role="progressbar"
                    aria-label={`${stage.label}进度`}
                    aria-valuemin={0}
                    aria-valuemax={stage.total}
                    aria-valuenow={stage.current}
                    className="mt-2 text-xs text-slate-400"
                  >
                    {stage.current} / {stage.total}{elapsed ? ` · ${elapsed}` : ''}
                  </p>
                </div>
              ) : (
                <TaskOutput task={selectedTask} />
              )}
            </div>

            {file && (
              <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm md:p-5">
                <h2 className="text-sm font-semibold text-slate-800">文件</h2>
                <Button
                  htmlType="button"
                  onClick={loadPreview}
                  className="mt-4 flex h-auto w-full items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-left transition-colors hover:bg-emerald-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{file.filename}</p>
                    <p className="mt-0.5 text-xs text-slate-500">点击预览工作簿前 3 个 sheet，最多展示前 40 行</p>
                  </div>
                  <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm">
                    预览
                  </span>
                </Button>
                <div className="mt-3 flex flex-wrap gap-2">
	                  <Button
	                    htmlType="button"
	                    onClick={() => { void downloadFile(file.url, file.filename).catch(() => undefined); }}
	                    className="h-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                  >
                    下载文件
                  </Button>
                  <Button
                    htmlType="button"
                    onClick={loadPreview}
                    disabled={previewing}
                    className="h-auto rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    {previewing ? '读取中...' : '预览文件'}
                  </Button>
                </div>
                {previewError && <p className="mt-3 text-sm text-red-500">{previewError}</p>}
                {preview && <WorkbookPreview sheets={preview} />}
              </div>
            )}

            {selectedTask.task_type === 'connector_sync' && selectedTask.status === 'completed' && (
              <ConnectorSyncResultPanel task={selectedTask} />
            )}
          </section>

          <aside className="space-y-4 md:space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <h2 className="text-sm font-semibold text-slate-800">基础信息</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <InfoRow label="任务 ID" value={selectedTask.task_id} />
                <InfoRow label="Celery ID" value={selectedTask.celery_task_id || '—'} />
                <InfoRow label="会话/来源" value={selectedTask.session_id || '—'} />
              </dl>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <h2 className="text-sm font-semibold text-slate-800">任务数据</h2>
              <div className="mt-4 space-y-3">
                {visibleMetaEntries(meta).length === 0 ? (
                  <p className="text-sm text-slate-400">暂无额外数据</p>
                ) : (
                  visibleMetaEntries(meta).map(([key, value]) => (
                    <div key={key} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">{key}</p>
                      <pre className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                        {renderValue(value)}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ConnectorSyncResultPanel({ task }: { task: TaskRecord }) {
  const meta = metaOf(task);
  const runId = typeof meta.connector_sync_run_id === 'string' ? meta.connector_sync_run_id : '';
  const [data, setData] = useState<ConnectorRecordTable | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const result = await getConnectorSyncRunRecords(runId, page, pageSize);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载连接器同步结果失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [runId, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [runId]);

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">连接器同步结果</h2>
          <p className="mt-1 text-xs text-slate-500">展示已清洗后的结构化记录，原始 JSON 保留在数据库中用于追溯。</p>
        </div>
        {loading && <span className="text-xs text-slate-400">加载中...</span>}
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {data && (
        <div className="mt-4 rounded-xl border border-slate-100">
          <TableDisplayFrame
            title="连接器同步结果"
            filename="连接器同步结果"
            tableClassName="max-h-[18rem] overflow-auto md:max-h-none"
            fullscreenPagination={{
              page: data.page,
              pageSize: data.page_size,
              total: data.total,
              totalPages: data.total_pages,
              pageSizeOptions: PAGE_SIZE_OPTIONS,
              loading,
              onPageChange: setPage,
              onPageSizeChange: (next) => {
                setPageSize(next);
                setPage(1);
              },
            }}
          >
            <Table<Record<string, unknown> & { __rowKey: string }>
              rowKey="__rowKey"
              columns={data.columns.map((column) => ({
                title: column.label,
                dataIndex: column.field,
                key: column.field,
                render: (value: unknown) => <span className="whitespace-nowrap text-slate-600">{String(value ?? '-')}</span>,
              })) as TableColumnsType<Record<string, unknown> & { __rowKey: string }>}
              dataSource={data.rows.map((row, index) => ({ ...row, __rowKey: String(index) }))}
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: '暂无结构化记录' }}
            />
          </TableDisplayFrame>
          <PaginationControls
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            totalPages={data.total_pages}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
}

function TaskFilterTabs({
  value,
  onChange,
}: {
  value: 'all' | 'finance' | 'reconcile';
  onChange: (value: 'all' | 'finance' | 'reconcile') => void;
}) {
  const options: Array<[typeof value, string]> = [
    ['all', '全部任务'],
    ['finance', '财务报表'],
    ['reconcile', '对账任务'],
  ];
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {options.map(([key, label]) => (
        <Button
          key={key}
          htmlType="button"
          onClick={() => onChange(key)}
          className={`h-10 shrink-0 rounded-xl border px-3 text-xs font-medium ${
            value === key ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function TaskOutput({ task }: { task: TaskRecord }) {
  const meta = metaOf(task);
  if (task.status === 'pending' || task.status === 'running' || task.status === 'retrying') {
    return <p className="mt-4 text-sm text-slate-500">任务正在处理中，完成后这里会展示输出数据。</p>;
  }
  if (task.status === 'failed') {
    return (
      <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
        {typeof meta.error === 'string' ? meta.error : '任务执行失败，请查看任务数据中的错误信息。'}
      </div>
    );
  }
  if (typeof meta.summary === 'string') {
    return <p className="mt-4 text-sm leading-relaxed text-slate-700">{meta.summary}</p>;
  }
  if (task.task_type === 'reconciliation') {
    return (
      <p className="mt-4 text-sm leading-relaxed text-slate-700">
        对账任务已完成。匹配数量、待复核数量和导出状态见右侧任务数据。
      </p>
    );
  }
  return <p className="mt-4 text-sm leading-relaxed text-slate-700">任务已完成。</p>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 break-all text-sm text-slate-700">{value}</dd>
    </div>
  );
}

function WorkbookPreview({ sheets }: { sheets: PreviewSheet[] }) {
  return (
    <div className="mt-5 space-y-5">
      {sheets.map((sheet) => {
        const rows = sheet.rows.length ? sheet.rows : [['空工作表']];
        const columnCount = Math.max(1, ...rows.map((row) => row.length));
        const dataSource = rows.map((row, rowIndex) => {
          const item: Record<string, string | number> & { __rowKey: string; __rowIndex: number } = { __rowKey: String(rowIndex), __rowIndex: rowIndex };
          for (let index = 0; index < columnCount; index += 1) item[`c${index}`] = row[index] || ' ';
          return item;
        });
        return (
        <CollapsiblePanel key={sheet.name} title={`Sheet：${sheet.name}`} summary={`预览 ${sheet.rows.length} 行`}>
          <TableDisplayFrame title={`Sheet：${sheet.name}`} filename={`Sheet_${sheet.name}`} tableClassName="max-h-[18rem] overflow-auto md:max-h-96">
            <Table
              rowKey="__rowKey"
              showHeader={false}
              columns={Array.from({ length: columnCount }, (_, index) => ({
                key: `c${index}`,
                dataIndex: `c${index}`,
                render: (value: string) => <span className="block max-w-52 whitespace-nowrap text-slate-700">{value}</span>,
              }))}
              dataSource={dataSource}
              pagination={false}
              size="small"
              rowClassName={(record) => (record.__rowIndex === 0 ? 'bg-slate-50' : '')}
              scroll={{ x: 'max-content' }}
            />
          </TableDisplayFrame>
        </CollapsiblePanel>
        );
      })}
    </div>
  );
}

function PaginationControls({
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
