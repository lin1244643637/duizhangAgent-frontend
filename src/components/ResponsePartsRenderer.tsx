import { useState } from 'react';
import { Alert, Button, Table, notification, type TableColumnsType } from 'antd';

import type { AgentResponseAction, AgentResponsePart, AgentResponsePayload } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';

const MOBILE_PREVIEW_ROW_LIMIT = 3;
const DESKTOP_PREVIEW_ROW_LIMIT = 10;
const UNIT_LABELS: Record<string, string> = {
  order: '单',
  store: '家',
  hour: '小时',
  period: '期',
  product: '种',
  item: '件',
  person: '人',
};

const RESULT_STATUS_LABELS: Partial<Record<AgentResponsePayload['result_status'], string>> = {
  partial: '结果不完整',
  empty: '暂无可用数据',
  unavailable: '数据暂不可用',
  failed: '分析失败',
};

const COMPARISON_STATUS_LABELS: Record<string, string> = {
  comparable: '可比',
  not_comparable: '不可比',
};

type ResponsePartsRendererProps = {
  response: AgentResponsePayload;
  onPrompt?: (message: string) => Promise<void>;
  onAction?: (action: AgentResponseAction) => Promise<void>;
  promptDisabled?: boolean;
};

type TableRow = Record<string, unknown> & { __rowKey: string };
type ResponseColumn = NonNullable<AgentResponsePart['columns']>[number];

export function formatDecimalForDisplay(value: string, unit?: string): string {
  const [integer, fraction = ''] = value.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const normalized = fraction ? `${grouped}.${fraction}` : grouped;
  return unit?.toLowerCase() === 'cny' ? `¥${normalized}` : normalized;
}

function displayDecimal(value: string, unit?: string): string {
  if (!unit) return formatDecimalForDisplay(value);
  const normalizedUnit = unit.toLowerCase();
  if (normalizedUnit === 'cny') return formatDecimalForDisplay(value, normalizedUnit);
  if (normalizedUnit === 'cny/hour' || normalizedUnit === 'cny_per_hour') {
    return `${formatDecimalForDisplay(value, 'cny')}/工时`;
  }
  if (normalizedUnit === 'ratio') {
    const ratio = Number(value);
    if (Number.isFinite(ratio)) return `${(ratio * 100).toFixed(1).replace(/\.0$/, '')}%`;
  }
  const unitLabel = UNIT_LABELS[normalizedUnit];
  if (unitLabel) return `${formatDecimalForDisplay(value)}${unitLabel}`;
  console.warn('[AgentResponse] unsupported display unit');
  return formatDecimalForDisplay(value);
}

function tableColumns(part: AgentResponsePart): ResponseColumn[] {
  if (part.columns?.length) return part.columns;
  return Object.keys(part.preview_rows?.[0] ?? {}).map((key) => ({ key, label: key }));
}

function tableCell(value: unknown, column: ResponseColumn): string {
  if (value == null) return '—';
  if (column.key === 'comparison_status' && typeof value === 'string') {
    const label = COMPARISON_STATUS_LABELS[value];
    if (label) return label;
    console.warn('[AgentResponse] unsupported comparison state');
    return '未知';
  }
  if (
    (column.data_type === 'decimal' || column.data_type === 'integer')
    && (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))
  ) return displayDecimal(String(value), column.unit);
  return String(value);
}

function TablePart({ part, action, expandable, tableKey }: { part: AgentResponsePart; action?: string; expandable: boolean; tableKey: string }) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const rows = part.preview_rows ?? [];
  const columns = tableColumns(part);
  const collapsedRowLimit = isMobile ? MOBILE_PREVIEW_ROW_LIMIT : DESKTOP_PREVIEW_ROW_LIMIT;
  const canToggleRows = expandable && rows.length > collapsedRowLimit;
  const visibleRows = canToggleRows && !expanded ? rows.slice(0, collapsedRowLimit) : rows;
  const dataSource: TableRow[] = visibleRows.map((row, index) => ({ ...row, __rowKey: `${tableKey}-${index}` }));
  const antdColumns: TableColumnsType<TableRow> = columns.map((column) => ({
    title: column.label,
    dataIndex: column.key,
    key: column.key,
    render: (value: unknown) => tableCell(value, column),
  }));

  if (columns.length === 0) return null;

  return (
    <section className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={part.title || '数据表'}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2">
        <div className="min-w-0">
          {part.title && <h3 className="truncate text-sm font-medium text-slate-700">{part.title}</h3>}
          {typeof part.row_count === 'number' && <p className="text-xs text-slate-400">{part.row_count} 行</p>}
        </div>
        {canToggleRows && (
          <Button
            type="link"
            size="small"
            className="shrink-0 px-1 text-xs text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            onClick={() => setExpanded(value => !value)}
          >
            {expanded ? '收回明细' : action ?? '展开明细'}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <Table<TableRow>
          columns={antdColumns}
          dataSource={dataSource}
          rowKey="__rowKey"
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      </div>
    </section>
  );
}

const insightLabels = {
  fact: '事实',
  hypothesis: '假设',
  recommendation: '建议',
} as const;

function InsightPart({ part }: { part: AgentResponsePart }) {
  if (!part.items?.length) return null;

  const label = part.title || '经营结论';
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      {part.title && <h3 className="mb-2 text-sm font-medium text-slate-700">{part.title}</h3>}
      <ul className="space-y-2 text-sm text-slate-700" aria-label={label}>
        {part.items.map((item, index) => (
          <li key={`${item.statement_type}-${index}`} className="flex gap-2">
            <span className="shrink-0 text-xs font-medium text-slate-500">{insightLabels[item.statement_type]}</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoticePart({ part }: { part: AgentResponsePart }) {
  if (!part.message || !part.severity) return null;

  return <Alert title={part.title} description={part.message} type={part.severity} showIcon />;
}

export function ResponsePartsRenderer({ response, onPrompt, onAction, promptDisabled = false }: ResponsePartsRendererProps) {
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [notificationApi, notificationContextHolder] = notification.useNotification();
  const payloadActionsBlocked = response.result_status === 'failed' || response.result_status === 'unavailable';
  const promptActions = response.actions?.filter((action) => (
    action.kind === 'prompt' && typeof action.params?.message === 'string'
  )) ?? [];
  const clarificationActions = response.actions?.filter((action) => (
    action.kind === 'clarify'
    && typeof action.params?.candidate_id === 'string'
    && typeof action.params?.message === 'string'
  )) ?? [];

  async function handlePrompt(actionId: string, message: string) {
    if (!onPrompt || promptDisabled || payloadActionsBlocked || pendingActionId) return;
    setPendingActionId(actionId);
    try {
      await onPrompt(message);
    } catch {
      notificationApi.error({ title: '发送后续问题失败', duration: 5, closable: true });
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleClarification(action: AgentResponseAction) {
    if (!onAction || promptDisabled || payloadActionsBlocked || pendingActionId) return;
    setPendingActionId(action.action_id);
    try {
      await onAction(action);
    } catch {
      notificationApi.error({ title: '发送后续问题失败', duration: 5, closable: true });
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div className="space-y-2">
      {notificationContextHolder}
      {RESULT_STATUS_LABELS[response.result_status] && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">{RESULT_STATUS_LABELS[response.result_status]}</div>
      )}
      {response.parts.map((part, index) => {
        if (part.kind === 'summary' && part.metrics?.length) {
          return (
            <section key={`summary-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2" aria-label={part.title || '汇总'}>
              {part.title && <h3 className="mb-2 text-sm font-medium text-slate-700">{part.title}</h3>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {part.metrics.map((metric) => (
                  <div key={metric.key} className="min-w-0">
                    <div className="truncate text-xs text-slate-500">{metric.label || metric.key}</div>
                    <div className="truncate text-sm font-medium text-slate-800">{displayDecimal(metric.value, metric.unit)}</div>
                  </div>
                ))}
              </div>
            </section>
          );
        }

        if (part.kind === 'table') {
          const action = response.actions?.find((candidate) => (
            candidate.action_id === 'expand_table'
            && candidate.kind === 'local'
            && (candidate.params?.table_id === undefined || candidate.params.table_id === part.table_id)
          ));
          return <TablePart key={`table-${part.table_id ?? index}`} part={part} action={action?.label} expandable={!payloadActionsBlocked} tableKey={part.table_id ?? String(index)} />;
        }

        if (part.kind === 'insights') {
          return <InsightPart key={`insights-${index}`} part={part} />;
        }

        if (part.kind === 'notice') {
          return <NoticePart key={`notice-${part.code ?? index}`} part={part} />;
        }

        if (part.kind === 'clarification' && part.message) {
          return (
            <section key={`clarification-${index}`} className="space-y-2 text-sm text-slate-700">
              <p>{part.message}</p>
              {clarificationActions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {clarificationActions.map((action) => {
                    const isPending = pendingActionId === action.action_id;
                    return (
                      <Button
                        key={action.action_id}
                        size="small"
                        disabled={promptDisabled || payloadActionsBlocked || Boolean(pendingActionId) || !onAction}
                        loading={isPending}
                        onClick={() => handleClarification(action)}
                      >
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        }

        console.warn('[AgentResponse] unsupported response part');
        return null;
      })}
      {promptActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {promptActions.map((action) => {
            const message = action.params?.message as string;
            const isPending = pendingActionId === action.action_id;
            return (
              <Button
                key={action.action_id}
                size="small"
                disabled={promptDisabled || payloadActionsBlocked || Boolean(pendingActionId) || !onPrompt}
                loading={isPending}
                onClick={() => handlePrompt(action.action_id, message)}
              >
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
