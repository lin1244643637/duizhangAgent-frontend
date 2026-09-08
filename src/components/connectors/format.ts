/** ConnectorsPage 的共享类型与纯格式化/解析助手（无 React 依赖，纯函数）。 */

import type {
  ConnectorEndpoint,
  ConnectorRecordSelectorSchema,
  ConnectorRecordTable,
  ConnectorReferenceRuleCandidate,
  ConnectorSyncRun,
} from '../../api/connectors';
import { formatBeijingTime, parseBeijingTime } from '../../utils/time';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export type NoticeVariant = 'success' | 'error' | 'warning' | 'info';
export type NoticeState = { message: string; variant: NoticeVariant };
export type AttendanceReportOption = {
  key: string;
  reportId: string;
  reportType: string;
  reportName: string;
  columnCount: number;
  columns: { id: string; name: string }[];
};

export function selectedFieldExample(endpoint?: ConnectorEndpoint): string[] {
  const schemaDefaults = endpoint?.field_schema
    ?.filter((field) => field.default !== false)
    .map((field) => field.path)
    .filter(Boolean);
  if (schemaDefaults?.length) return schemaDefaults;
  return endpoint?.selected_fields_hint || [];
}

export function formatRecordCell(value: unknown): string {
  if (value === null || value === undefined || value === '' || value === 'null') return '-';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return formatRecordArray(value);
  if (typeof value === 'object') return formatRecordObject(value as Record<string, unknown>);
  const text = String(value).trim();
  if (!text) return '-';
  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      return formatRecordCell(JSON.parse(text));
    } catch {
      return text.length > 80 ? `${text.slice(0, 80)}...` : text;
    }
  }
  return formatStatusResultValue(text);
}

export function formatReferenceCandidate(candidate: ConnectorReferenceRuleCandidate): string {
  const rule = candidate.rule;
  const endpoint = rule.source_endpoint_keys[0] || '当前数据';
  const idKey = rule.id_keys[0] || 'ID';
  const nameKey = rule.name_keys[0] || '名称';
  return `${endpoint}：${idKey} → ${nameKey}`;
}

export function formatReferenceSamples(candidate: ConnectorReferenceRuleCandidate): string {
  const samples = candidate.samples
    .slice(0, 2)
    .map((item) => `${item.name}（${item.id}）`);
  return samples.length ? samples.join('、') : '暂无样例';
}

export function formatStatusResultValue(value: string): string {
  const labels: Record<string, string> = {
    NEW: '新建',
    RUNNING: '进行中',
    COMPLETED: '已完成',
    TERMINATED: '已终止',
    CANCELED: '已取消',
    CANCELLED: '已取消',
    PENDING: '待处理',
    SUCCESS: '成功',
    FAILED: '失败',
    FAILURE: '失败',
    NORMAL: '正常',
    MISSING_CHECK: '缺卡',
    OUTSIDE: '外勤',
    LATE: '迟到',
    EARLY: '早退',
    agree: '同意',
    refuse: '拒绝',
    redirect: '转交',
    terminate: '终止',
    cancel: '取消',
  };
  return labels[value] ?? labels[value.toUpperCase()] ?? value;
}

export function formatRunCounts(run: ConnectorSyncRun): string {
  const failed = run.failed_count ? ` · 失败 ${run.failed_count} 条` : '';
  return `获取 ${run.total_count} 条 · 新增 ${run.success_count} 条${failed}`;
}

export function formatSyncRange(run: ConnectorSyncRun): string {
  const override = run.request_params_override || {};
  const start = typeof override.sync_start_datetime === 'string' ? override.sync_start_datetime : '';
  const end = typeof override.sync_end_datetime === 'string' ? override.sync_end_datetime : '';
  const requestWindow = start && end ? `（请求窗口：${formatMaybeDateTime(start)} 至 ${formatMaybeDateTime(end)}）` : '';
  if (!run.date_from && !run.date_to) return requestWindow ? requestWindow.replace(/^（|）$/g, '') : '无日期范围';
  if (run.date_from && run.date_to) {
    const dateRange = run.date_from === run.date_to ? run.date_from : `${run.date_from} 至 ${run.date_to}`;
    return `${dateRange}${requestWindow}`;
  }
  const dateRange = run.date_from ? `${run.date_from} 起` : `截至 ${run.date_to}`;
  return `${dateRange}${requestWindow}`;
}

function formatMaybeDateTime(value: string): string {
  return /\d{4}-\d{2}-\d{2}T/.test(value)
    ? formatBeijingTime(value, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : value;
}

export function formatRunExecutionTime(run: ConnectorSyncRun): string {
  const started = run.started_at ? formatBeijingTime(run.started_at) : '未开始';
  const finished = run.finished_at ? formatBeijingTime(run.finished_at) : '未完成';
  const duration = formatRunDuration(run.started_at, run.finished_at);
  return `${started} → ${finished}${duration ? `（${duration}）` : ''}`;
}

export function formatRunDuration(startedAt?: string | null, finishedAt?: string | null): string {
  if (!startedAt || !finishedAt) return '';
  const started = parseBeijingTime(startedAt);
  const finished = parseBeijingTime(finishedAt);
  if (Number.isNaN(started) || Number.isNaN(finished) || finished < started) return '';
  const seconds = Math.round((finished - started) / 1000);
  if (seconds < 60) return `耗时 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return `耗时 ${minutes} 分 ${restSeconds} 秒`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `耗时 ${hours} 小时 ${restMinutes} 分`;
}

function formatRecordArray(items: unknown[]): string {
  if (items.length === 0) return '-';
  if (items.every((item) => typeof item !== 'object' || item === null)) {
    return items.map((item) => formatRecordCell(item)).filter((item) => item !== '-').join('、') || '-';
  }
  const texts = items.slice(0, 3).map((item) => formatRecordCell(item)).filter((item) => item !== '-');
  return texts.length ? `${texts.join('；')}${items.length > texts.length ? ` 等 ${items.length} 项` : ''}` : `${items.length} 项`;
}

function formatRecordObject(item: Record<string, unknown>): string {
  for (const key of ['value', 'component_value', 'componentValue', 'column_value', 'columnValue', 'name', 'title', 'label']) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') return formatRecordCell(item[key]);
  }
  const pairs = Object.entries(item)
    .filter(([key, value]) => !['raw', 'raw_payload', 'tasks', 'operation_records'].includes(key) && typeof value !== 'object')
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${formatRecordCell(value)}`);
  return pairs.length ? pairs.join('；') : `${Object.keys(item).length} 项`;
}

export function buildAttendanceReportOptions(rows: ConnectorRecordTable['rows'], schema?: ConnectorRecordSelectorSchema | null): AttendanceReportOption[] {
  const groups = new Map<string, AttendanceReportOption & { seen: Set<string> }>();
  const fields = selectorOptionFields(schema);
  const columnIdFields = schema?.column_id_fields?.length ? schema.column_id_fields : ['报表项ID', 'id', 'column_id', 'columnId'];
  const columnNameFields = schema?.column_name_fields?.length ? schema.column_name_fields : ['报表项名称', '字段名称', 'name', 'column_name', 'columnName'];
  for (const row of rows) {
    const columnName = stringCell(row, columnNameFields);
    const columnId = pureColumnId(stringCell(row, columnIdFields));
    const inferred = inferAttendanceReportOption(columnName, stringCell(row, ['字段类型', 'type']));
    const reportName = stringCell(row, [fields.name, '所属报表', 'report_name', 'reportName']) || inferred.reportName;
    const reportType = stringCell(row, [fields.type, '报表类型编码', 'report_type', 'reportType']) || inferred.reportType;
    const reportId = stringCell(row, [fields.id, '报表类型ID', 'report_id', 'reportId']);
    const key = attendanceReportOptionKey(reportId, reportType, reportName);
    let existing = groups.get(key);
    if (!existing) {
      existing = { key, reportId, reportType, reportName, columnCount: 0, columns: [], seen: new Set() };
      groups.set(key, existing);
    }
    if (columnId && !existing.seen.has(columnId)) {
      existing.seen.add(columnId);
      existing.columns.push({ id: columnId, name: columnName || columnId });
    }
    existing.columnCount = existing.columns.length;
  }
  return Array.from(groups.values())
    .map(({ seen: _seen, ...rest }) => rest)
    .sort((a, b) => a.reportName.localeCompare(b.reportName, 'zh-CN'));
}

function inferAttendanceReportOption(name: string, type: string): Pick<AttendanceReportOption, 'reportName' | 'reportType'> {
  const text = `${name} ${type}`;
  const rules: Array<[string, string, string[]]> = [
    ['attendance_schedule', '考勤排班月度汇总', ['排班', '班次', '应出勤']],
    ['attendance_punch', '打卡明细', ['打卡时间', '打卡结果', '上班', '下班']],
    ['attendance_summary', '考勤统计汇总', ['出勤', '迟到', '早退', '缺卡', '旷工', '请假', '加班', '工作时长']],
    ['attendance_risk', '异常/疑似作弊', ['作弊', '异常']],
    ['attendance_raw', '原始记录', ['原始']],
  ];
  const matched = rules.find(([, , markers]) => markers.some((marker) => text.includes(marker)));
  return matched ? { reportType: matched[0], reportName: matched[1] } : { reportType: 'attendance_uncategorized', reportName: '未分类考勤报表' };
}

export function attendanceReportOptionKey(reportId: string, reportType: string, reportName: string): string {
  return [reportId || '-', reportType || '-', reportName || '-'].join('|');
}

// 展示层会把参考字段渲染成「名称（ID）」，而后端按纯 ID 匹配选列。仅当末尾括号内是纯数字
// 时取出该 ID，避免把名称里的括号（如 "迟到时长(分钟)"）误当 ID；其余原样返回。
export function pureColumnId(raw: string): string {
  const match = raw.match(/[（(]\s*(\d+)\s*[）)]\s*$/);
  return (match ? match[1] : raw).trim();
}

export function selectorOptionFields(schema?: ConnectorRecordSelectorSchema | null): { id: string; type: string; name: string } {
  return {
    id: schema?.option_fields?.id || 'report_id',
    type: schema?.option_fields?.type || 'report_type',
    name: schema?.option_fields?.name || 'report_name',
  };
}

export function safeParseJson(text: string): Record<string, string | string[]> {
  try {
    const value = JSON.parse(text || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function stringCell(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '' && value !== 'null') return String(value);
  }
  return '';
}

export function selectedRequestParamsExample(_endpoint?: ConnectorEndpoint): Record<string, unknown> {
  return {};
}

export function selectedFieldMappingExample(endpoint?: ConnectorEndpoint): Record<string, string> {
  const schemaMapping: Record<string, string> = {};
  for (const field of endpoint?.field_schema || []) {
    if (field.default !== false) schemaMapping[field.path] = field.label;
  }
  return schemaMapping;
}

export function selectedFieldAliasesExample(endpoint?: ConnectorEndpoint): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const field of endpoint?.field_schema || []) {
    if (field.aliases?.length) result[field.path] = field.aliases;
  }
  return result;
}

export function parseJson(value: string, label: string): Record<string, unknown> {
  try {
    const data = JSON.parse(value || '{}');
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
}
