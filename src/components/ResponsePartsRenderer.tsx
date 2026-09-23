import { useState } from 'react';
import { RightOutlined } from '@ant-design/icons';
import { Alert, Button, Table, notification, type TableColumnsType } from 'antd';

import type { AgentResponseAction, AgentResponsePart, AgentResponsePayload } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import { TableDisplayFrame, type TableDisplayData } from './TableDisplayFrame';

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
  const hasCompleteRows = typeof part.row_count !== 'number' || part.row_count <= rows.length;
  const rowCountLabel = typeof part.row_count === 'number'
    ? hasCompleteRows ? `${part.row_count} 行` : `当前展示 ${rows.length} / ${part.row_count} 行`
    : `${rows.length} 行`;
  const dataSource: TableRow[] = visibleRows.map((row, index) => ({ ...row, __rowKey: `${tableKey}-${index}` }));
  const antdColumns: TableColumnsType<TableRow> = columns.map((column) => ({
    title: column.label,
    dataIndex: column.key,
    key: column.key,
    render: (value: unknown) => tableCell(value, column),
  }));

  if (columns.length === 0) return null;

  const exportTables: TableDisplayData[] = [{
    title: part.title,
    headers: columns.map(column => column.label),
    rows: rows.map(row => columns.map(column => tableCell(row[column.key], column))),
  }];

  const toolbarExtra = (
    <>
      <span className="whitespace-nowrap text-xs text-slate-400">{rowCountLabel}</span>
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
    </>
  );

  return (
    <section className="mt-2" aria-label={part.title || '数据表'}>
      <TableDisplayFrame
        title={part.title || '数据表'}
        filename={part.title || '数据表'}
        className="rounded-xl border border-slate-200 bg-white"
        tableClassName="overflow-x-auto"
        exportTables={exportTables}
        toolbarExtra={toolbarExtra}
        showDownload={hasCompleteRows}
      >
        <Table<TableRow>
          columns={antdColumns}
          dataSource={dataSource}
          rowKey="__rowKey"
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      </TableDisplayFrame>
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
    <section className="border-l-2 border-slate-200 py-1 pl-3">
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
    <div className="w-full space-y-3">
      {notificationContextHolder}
      {RESULT_STATUS_LABELS[response.result_status] && (
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          {RESULT_STATUS_LABELS[response.result_status]}
        </div>
      )}
      {response.parts.map((part, index) => {
        if (part.kind === 'summary' && part.metrics?.length) {
          return (
            <section key={`summary-${index}`} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm" aria-label={part.title || '汇总'}>
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
            <section key={`clarification-${index}`} className="space-y-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 text-sm text-slate-700 shadow-sm">
              <p className="whitespace-pre-line leading-6">{part.message}</p>
              {clarificationActions.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {clarificationActions.map((action) => {
                    const isPending = pendingActionId === action.action_id;
                    return (
                      <Button
                        key={action.action_id}
                        autoInsertSpace={false}
                        icon={<RightOutlined aria-hidden="true" />}
                        iconPlacement="end"
                        disabled={promptDisabled || payloadActionsBlocked || Boolean(pendingActionId) || !onAction}
                        loading={isPending}
                        onClick={() => handleClarification(action)}
                        className="min-h-11 w-full justify-between whitespace-normal rounded-xl border-blue-200 bg-blue-50 px-3.5 py-2 text-left text-sm font-medium leading-5 text-blue-700 shadow-none transition-all duration-200 hover:border-blue-300 hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-blue-200 sm:w-auto"
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
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {promptActions.map((action) => {
            const message = action.params?.message as string;
            const isPending = pendingActionId === action.action_id;
            return (
              <Button
                key={action.action_id}
                autoInsertSpace={false}
                icon={<RightOutlined aria-hidden="true" />}
                iconPlacement="end"
                disabled={promptDisabled || payloadActionsBlocked || Boolean(pendingActionId) || !onPrompt}
                loading={isPending}
                onClick={() => handlePrompt(action.action_id, message)}
                className="min-h-11 w-full justify-between whitespace-normal rounded-xl border-slate-200 bg-white px-3.5 py-2 text-left text-sm font-medium leading-5 text-slate-700 shadow-sm transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-200 sm:w-auto"
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
