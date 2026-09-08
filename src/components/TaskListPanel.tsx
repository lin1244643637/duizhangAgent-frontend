import { useEffect } from 'react';
import { Badge, Button } from 'antd';
import { GLOBAL_TASK_POLL_SCOPE, useTaskStore } from '../store/taskStore';
import {
  TASK_RUN_STATUS_LABELS,
  taskRunStatus,
  type TaskRecord,
} from '../types/task';
import { downloadFile } from '../utils/downloadFile';
import { formatBeijingTime } from '../utils/time';
import { useTaskStage } from '../utils/taskStage';

const LABELS: Record<string, string> = {
  file_parsing: '文件解析',
  reconciliation: '对账',
  finance_report: '财务报表',
  salary_report: '工资表',
  hr_sync: '人事同步',
  connector_sync: '连接器同步',
  research: '经营研究',
};

const STATUS_BADGES: Record<string, 'default' | 'processing' | 'success' | 'error' | 'warning'> = {
  pending: 'default',
  queued: 'default',
  running: 'processing',
  retrying: 'processing',
  validating: 'processing',
  waiting_for_data: 'warning',
  waiting_for_approval: 'warning',
  needs_review: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
};

const TASK_LIST_POLL_OWNER = 'task-list-panel';

export function TaskListPanel() {
  const { tasks, selectedTaskId, selectTask, startPolling, stopPolling, deleteTask } = useTaskStore();
  const visibleTasks = tasks.filter((task) => task.task_type !== 'file_parsing');

  useEffect(() => {
    startPolling(TASK_LIST_POLL_OWNER, GLOBAL_TASK_POLL_SCOPE);
    return () => stopPolling(TASK_LIST_POLL_OWNER);
  }, [startPolling, stopPolling]);

  if (visibleTasks.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto py-3 px-3 text-xs text-slate-400 text-center">
        <p>暂无任务</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {visibleTasks.map((task) => (
        <TaskItem
          key={task.task_id}
          task={task}
          active={task.task_id === selectedTaskId}
          onOpen={(item) => selectTask(item.task_id)}
          onDelete={deleteTask}
        />
      ))}
    </div>
  );
}

function TaskItem({
  task,
  active,
  onOpen,
  onDelete,
}: {
  task: TaskRecord;
  active: boolean;
  onOpen: (task: TaskRecord) => void;
  onDelete: (taskId: string) => void;
}) {
  const runStatus = taskRunStatus(task);
  const badgeStatus = STATUS_BADGES[runStatus] ?? 'default';
  const label = LABELS[task.task_type] ?? task.task_type;
  const time = task.updated_at
    ? formatBeijingTime(task.updated_at, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const meta = (task.meta as Record<string, unknown>) || {};
  const { stage, elapsed } = useTaskStage(task);
  const isCached = meta?.cached === true;
  const hasExport = meta?.has_export === true && !!meta?.period;
  const isCompletedReconcile = task.status === 'completed' && task.task_type === 'reconciliation';
  const isFinanceReport = task.status === 'completed' && task.task_type === 'finance_report';
  const isSalaryReport = task.status === 'completed' && task.task_type === 'salary_report';
  const isHrSync = task.task_type === 'hr_sync';
  const taskName = typeof meta.task_name === 'string' ? meta.task_name : label;
  const reportUrl = typeof meta.download_url === 'string' ? meta.download_url : '';
  const reportFilename = typeof meta.filename === 'string' ? meta.filename : isSalaryReport ? '工资表.xlsx' : '财务报表.xlsx';
  const reconcilePeriod = typeof meta.period === 'string' ? meta.period : '';
  const downloadUrl = isFinanceReport || isSalaryReport ? reportUrl : (isCompletedReconcile && reconcilePeriod ? `/api/v1/reconcile/export/${encodeURIComponent(reconcilePeriod)}` : '');
  const downloadFilename = isFinanceReport || isSalaryReport ? reportFilename : `reconcile_${reconcilePeriod.replace('-', '_')}.xlsx`;

  return (
    <div className="relative group">
      <Button
        autoInsertSpace={false}
        type="text"
        onClick={() => onOpen(task)}
        className={`flex h-auto w-full flex-col items-start justify-start rounded-none border-l-2 px-3 py-2.5 pr-8 text-left shadow-none transition-colors ${
          active
            ? 'border-blue-500 bg-blue-50/80'
            : 'border-transparent hover:bg-slate-50'
        }`}
      >
        <div className="flex w-full items-center justify-start gap-2 text-left">
          <Badge status={badgeStatus} />
          <span className="truncate text-left text-sm text-slate-700">{taskName}</span>
          {isCached && (
            <span className="text-[10px] text-amber-600 shrink-0">已缓存</span>
          )}
          {isCompletedReconcile && hasExport && (
            <span className="text-red-500 text-xs shrink-0" title="可下载报告">★</span>
          )}
          {isCompletedReconcile && !hasExport && (
            <span className="text-green-500 text-xs shrink-0">✓</span>
          )}
          {(isFinanceReport || isSalaryReport) && (
            <span className="text-[10px] text-emerald-600 shrink-0">Excel</span>
          )}
        </div>
        {stage ? (
          <>
            <p className="mt-0.5 w-full truncate text-left text-xs font-medium text-slate-500">{stage.label}</p>
            <p className="w-full truncate text-left text-xs text-slate-400">{stage.detail}</p>
            <p
              role="progressbar"
              aria-label={`${stage.label}进度`}
              aria-valuemin={0}
              aria-valuemax={stage.total}
              aria-valuenow={stage.current}
              className="w-full truncate text-left text-[11px] text-slate-400"
            >
              {stage.current} / {stage.total}{elapsed ? ` · ${elapsed}` : ''}
            </p>
          </>
        ) : (
          <p className="mt-0.5 w-full truncate text-left text-xs text-slate-400">
            {task.task_type === 'research' && runStatus in TASK_RUN_STATUS_LABELS
              ? TASK_RUN_STATUS_LABELS[runStatus as keyof typeof TASK_RUN_STATUS_LABELS]
              : isFinanceReport || isSalaryReport
                ? reportFilename
                : isHrSync
                  ? `${meta.trigger_source === 'schedule' ? '自动任务' : '手动任务'} · 查看同步结果`
                  : time}{isCached && ' · 已缓存'}
          </p>
        )}
      </Button>
	      {downloadUrl && (
	        <Button
	          autoInsertSpace={false}
	          htmlType="button"
	          onClick={(e) => {
	            e.stopPropagation();
	            void downloadFile(downloadUrl, downloadFilename).catch(() => undefined);
	          }}
	          className="absolute right-7 top-1/2 h-auto -translate-y-1/2 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 opacity-0 transition-all hover:bg-emerald-100 group-hover:opacity-100"
	          title={isFinanceReport || isSalaryReport ? '下载报表' : '下载对账差异'}
	        >
	          下载
	        </Button>
	      )}
	      <Button
	        autoInsertSpace={false}
	        type="text"
	        onClick={(e) => { e.stopPropagation(); onDelete(task.task_id); }}
	        className="absolute right-2 top-1/2 h-auto -translate-y-1/2 border-0 p-0 text-base leading-none text-slate-300 opacity-0 shadow-none transition-all hover:text-red-500 group-hover:opacity-100"
	        title="删除任务"
	      >
	        ×
	      </Button>
	    </div>
	  );
	}
