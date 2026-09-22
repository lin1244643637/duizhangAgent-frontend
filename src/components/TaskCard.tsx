import { useState } from 'react';
import { Button, Input, Tag, notification } from 'antd';
import { resumeAgentRun, type AgentRunCommandResult } from '../api/agentRuns';
import {
  TASK_RUN_STATUS_LABELS,
  taskRunStatus,
  type TaskRecord,
} from '../types/task';
import { apiFetch } from '../api/client';
import { downloadFile } from '../utils/downloadFile';
import { createId } from '../utils/id';
import { useTaskStage } from '../utils/taskStage';

interface Props {
  task: TaskRecord;
  onResearchResume?: (task: TaskRecord, result: AgentRunCommandResult) => Promise<void> | void;
  onResearchCancel?: (task: TaskRecord) => Promise<void> | void;
  researchCancelling?: boolean;
}

const LABELS: Record<string, string> = {
  file_parsing: '文件解析',
  reconciliation: '对账',
  finance_report: '财务报表',
  salary_report: '工资表',
  research: '经营研究',
  general_graph: '智能问答',
};

const RESEARCH_STATUS_COLORS: Record<string, string> = {
  queued: 'default',
  running: 'processing',
  validating: 'processing',
  waiting_for_data: 'warning',
  waiting_for_approval: 'warning',
  needs_review: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
};

const NOTIFICATION_OPTIONS = {
  duration: 5,
  closable: true,
} as const;

function manualReviewDetail(reason: unknown): string {
  if (reason === 'invalid_tool_call') {
    return '模型请求了当前研究不允许使用的工具，系统已暂停，避免越权或误用数据。请确认模型与工具契约修复后再继续。';
  }
  if (reason === 'model_runtime_error') {
    return '模型服务调用失败，系统已暂停，避免无限重试或误导用户。请检查模型供应商、网络或限额后再继续。';
  }
  if (reason === 'malformed_action') {
    return '模型返回的结构不符合研究协议，系统已暂停。请确认结构化输出配置后再继续。';
  }
  return '系统检测到研究过程需要人工复核，已暂停自动执行。请确认风险已处理后再继续。';
}

export function TaskCard({ task, onResearchResume, onResearchCancel, researchCancelling = false }: Props) {
  const label = LABELS[task.task_type] ?? task.task_type;
  const meta = (task.meta || {}) as Record<string, unknown>;
  const runStatus = taskRunStatus(task);
  const waitingForData = task.task_type === 'research' && runStatus === 'waiting_for_data';
  const waitingForReview = task.task_type === 'research' && runStatus === 'needs_review';
  const [additionalData, setAdditionalData] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resumeRequestId, setResumeRequestId] = useState<string | null>(null);
  const { stage, elapsed } = useTaskStage(task);
  const isCached = meta?.cached === true;
  const fileResults = Array.isArray(meta.file_results)
    ? meta.file_results as Array<{filename: string; status: string; count?: number; error?: string}>
    : null;
  const hasRetryableFiles = Array.isArray(meta.retryable_files) && meta.retryable_files.length > 0;
  const exactMatched = typeof meta.exact_matched === 'number' ? meta.exact_matched : 0;
  const fuzzyMatched = typeof meta.fuzzy_matched === 'number' ? meta.fuzzy_matched : 0;
  const needsReview = typeof meta.needs_review === 'number' ? meta.needs_review : 0;
  const unmatchedBankCount = typeof meta.unmatched_bank_count === 'number' ? meta.unmatched_bank_count : 0;
  const platformCount = typeof meta.platform_count === 'number'
    ? meta.platform_count
    : exactMatched + fuzzyMatched + Math.max(0, needsReview - unmatchedBankCount);
  const exportPeriod = typeof meta.period === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(meta.period)
    ? meta.period
    : null;
  const waitingDetail = typeof meta.waiting_reason === 'string' && meta.waiting_reason.trim()
    ? meta.waiting_reason.trim()
    : '需要补充与本次经营研究相关的资料后才能继续。';
  const reviewReason = typeof meta.review_reason === 'string'
    ? meta.review_reason
    : typeof meta.run_reason === 'string'
      ? meta.run_reason
      : null;
  const reviewDetail = manualReviewDetail(reviewReason);
  const failureDetail = typeof meta.failure_detail === 'string' && meta.failure_detail.trim()
    ? meta.failure_detail.trim()
    : '任务执行失败，请稍后重试。';

  async function handleResearchResume() {
    const message = additionalData.trim();
    if (!message || submitting) return;
    setSubmitting(true);
    try {
      const requestId = resumeRequestId ?? createId();
      if (!resumeRequestId) setResumeRequestId(requestId);
      const result = await resumeAgentRun(task.task_id, requestId, message);
      setAdditionalData('');
      setResumeRequestId(null);
      notification.success({
        message: waitingForReview ? '已提交复核说明，研究将继续' : '已提交补充资料，研究将继续',
        ...NOTIFICATION_OPTIONS,
      });
      await onResearchResume?.(task, result);
    } catch {
      notification.error({
        message: '研究任务恢复失败',
        ...NOTIFICATION_OPTIONS,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload(href: string, fallbackFilename: string) {
    try {
      await downloadFile(href, fallbackFilename);
      notification.success({
        message: '下载已开始',
        ...NOTIFICATION_OPTIONS,
      });
    } catch (error) {
      notification.error({
        message: '下载失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        ...NOTIFICATION_OPTIONS,
      });
    }
  }

  async function handleRetryFiles() {
    try {
      const res = await apiFetch(`/api/v1/tasks/${encodeURIComponent(task.task_id)}/retry-files`, { method: 'POST' });
      if (!res.ok) throw new Error('重试请求失败，请稍后再试');
      notification.success({
        message: '已提交失败文件重试',
        ...NOTIFICATION_OPTIONS,
      });
    } catch (error) {
      notification.error({
        message: '重试失败',
        description: error instanceof Error ? error.message : '请稍后再试',
        ...NOTIFICATION_OPTIONS,
      });
    }
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[75%] bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm ml-9 shadow-sm">
        <div className="flex items-center gap-2">
          {task.status === 'pending' && (
            <svg className="animate-spin h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {(task.status === 'running' || task.status === 'retrying') && (
            <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {task.status === 'completed' && (
            <svg className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          {task.status === 'failed' && (
            <svg className="h-4 w-4 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
          <span className="font-medium text-slate-700">{label}</span>
          {task.task_type === 'research' && runStatus in TASK_RUN_STATUS_LABELS && (
            <Tag color={RESEARCH_STATUS_COLORS[runStatus]}>
              {TASK_RUN_STATUS_LABELS[runStatus as keyof typeof TASK_RUN_STATUS_LABELS]}
            </Tag>
          )}
          {isCached && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700 border border-amber-200">已缓存</span>
          )}
        </div>

        {stage && (
          <div className="mt-1 text-xs text-slate-500">
            <p className="font-medium text-slate-600">{stage.label}</p>
            <p className="mt-0.5 text-slate-400">{stage.detail}</p>
            <div
              role="progressbar"
              aria-label={`${stage.label}进度`}
              aria-valuemin={0}
              aria-valuemax={stage.total}
              aria-valuenow={stage.current}
              className="mt-1 flex items-center gap-2 text-slate-400"
            >
              <span>{stage.current} / {stage.total}</span>
              {elapsed && <span>{elapsed}</span>}
            </div>
          </div>
        )}
        {!stage && task.status === 'pending' && (
          <p className="mt-1 text-slate-400 text-xs">任务等待中…</p>
        )}
        {!stage && task.status === 'running' && !waitingForData && !waitingForReview && (
          <p className="mt-1 text-slate-400 text-xs">{label}进行中…</p>
        )}
        {!stage && task.status === 'retrying' && (
          <p className="mt-1 text-slate-400 text-xs">{label}重试中…</p>
        )}
        {(waitingForData || waitingForReview) && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-amber-700">{waitingForReview ? reviewDetail : waitingDetail}</p>
            <Input.TextArea
              aria-label={waitingForReview ? '复核说明' : '补充资料'}
              value={additionalData}
              onChange={(event) => {
                setAdditionalData(event.target.value);
                setResumeRequestId(null);
              }}
              disabled={submitting || researchCancelling}
              rows={3}
              placeholder={waitingForReview ? '请填写复核说明' : '请补充与本次经营研究相关的资料'}
            />
            <div className="flex gap-2">
              <Button
                autoInsertSpace={false}
                type="primary"
                htmlType="button"
                onClick={handleResearchResume}
                disabled={submitting || researchCancelling || !additionalData.trim()}
              >
                {waitingForReview ? '确认继续' : '补充资料并继续'}
              </Button>
              <Button
                autoInsertSpace={false}
                htmlType="button"
                onClick={() => onResearchCancel?.(task)}
                disabled={submitting || researchCancelling}
              >
                取消研究
              </Button>
            </div>
          </div>
        )}
        {task.status === 'failed' && task.task_type !== 'file_parsing' && (
          <p className="mt-1 text-xs leading-5 text-red-500">{failureDetail}</p>
        )}
        {task.status === 'completed' && task.task_type === 'reconciliation' && (
          <div className="mt-1 text-xs text-slate-500">
            {!!meta.summary && <p className="mb-1">{String(meta.summary)}</p>}
            {!meta.summary && (
              <p>对账完成 — 平台 {platformCount}条 / 精确匹配 {exactMatched}条 / 模糊 {fuzzyMatched}条 / 待复核 {needsReview}条</p>
            )}
            {Object.prototype.hasOwnProperty.call(meta, 'unmatched_bank_count') && (
              <p>银行单边待复核 {unmatchedBankCount}条</p>
            )}
            {meta.has_export === true && exportPeriod && (
	              <Button
	                autoInsertSpace={false}
	                type="link"
	                htmlType="button"
	                onClick={() => handleDownload(
	                  `/api/v1/reconcile/export/${encodeURIComponent(exportPeriod)}`,
	                  `reconcile_${exportPeriod.replace('-', '_')}.xlsx`,
	                )}
	                className="mt-1 h-auto p-0 text-blue-500 underline hover:text-blue-600"
	              >
	                下载 Excel
	              </Button>
	            )}
          </div>
        )}
        {task.status === 'completed' && (task.task_type === 'finance_report' || task.task_type === 'salary_report') && (
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
            <p className="text-xs font-medium text-slate-700 truncate">
              {typeof meta.filename === 'string' ? meta.filename : task.task_type === 'salary_report' ? '工资表.xlsx' : '财务报表.xlsx'}
            </p>
	            <Button
	              autoInsertSpace={false}
	              htmlType="button"
	              onClick={() => handleDownload(
	                typeof meta.download_url === 'string' ? meta.download_url : '',
	                typeof meta.filename === 'string' ? meta.filename : task.task_type === 'salary_report' ? '工资表.xlsx' : '财务报表.xlsx',
	              )}
	              disabled={typeof meta.download_url !== 'string'}
	              className="mt-2 h-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
	            >
	              下载 Excel
	            </Button>
	          </div>
        )}
        {(task.status === 'completed' || task.status === 'failed') && task.task_type === 'file_parsing' && (
          <div className="mt-1 text-xs text-slate-500">
            {fileResults?.map((r, i) => (
              <p key={i}>
                {r.status === 'ok'
                  ? `✓ ${r.filename}：写入 ${r.count ?? 0} 条`
                  : r.status === 'pending'
                    ? `… ${r.filename}：${r.error ?? '未处理'}`
                    : `✗ ${r.filename}：${r.error ?? '失败'}`}
              </p>
            ))}
            {!fileResults && <p>{task.status === 'failed' ? '任务执行失败' : `${label}完成`}</p>}
            {task.status === 'failed' && hasRetryableFiles && (
              <Button
                autoInsertSpace={false}
                htmlType="button"
                onClick={handleRetryFiles}
                className="mt-2 h-auto rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-600 hover:text-blue-700"
              >
                重试失败文件
              </Button>
            )}
          </div>
        )}
        {task.status === 'completed' && task.task_type !== 'reconciliation' && task.task_type !== 'file_parsing' && task.task_type !== 'finance_report' && task.task_type !== 'salary_report' && (
          <p className="mt-1 text-green-600 text-xs">{label}完成</p>
        )}
      </div>
    </div>
  );
}
