import { useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react';
import { Button, Checkbox, Input, Modal, Select, Table, type TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useAuthStore } from '../store/authStore';
import { ConfirmDialog } from './ConfirmDialog';
import { TableDisplayFrame } from './TableDisplayFrame';
import {
  deleteConnectorDataSource,
  deleteConnectorSchedule,
  deleteConnectorSyncRun,
  draftConnectorDataSource,
  getConnectorIntegration,
  getConnectorSyncRunRecords,
  listConnectorReferenceRuleCandidates,
  listConnectorDataSources,
  listConnectorEndpoints,
  listConnectorProviders,
  listConnectorSchedules,
  listConnectorSyncRuns,
  runConnectorScheduleNow,
  saveConnectorDataSource,
  saveConnectorReferenceRule,
  saveConnectorSchedule,
  syncConnectorDataSource,
  getConnectorDatasetCard,
  updateConnectorDatasetPurpose,
  testConnectorDataSourcePermission,
  getShihengOrderAuth,
  getShihengOrderRuntime,
  type ConnectorDataSource,
  type ConnectorIntegration,
  type ConnectorEndpoint,
  type ConnectorProvider,
  type ConnectorReferenceRuleCandidate,
  type ConnectorRecordTable,
  type ConnectorSyncSchedule,
  type ConnectorSyncWindowConfig,
  type ConnectorSyncRun,
  type ConnectorSyncRunsPage,
  type ShihengOrderAuthConfig,
  type ShihengOrderRuntime,
} from '../api/connectors';
import { usePolling } from '../hooks/usePolling';
import {
  PAGE_SIZE_OPTIONS,
  attendanceReportOptionKey,
  buildAttendanceReportOptions,
  formatRecordCell,
  formatReferenceCandidate,
  formatReferenceSamples,
  formatRunCounts,
  formatRunExecutionTime,
  formatSyncRange,
  parseJson,
  safeParseJson,
  selectedFieldAliasesExample,
  selectedFieldExample,
  selectedFieldMappingExample,
  selectedRequestParamsExample,
  selectorOptionFields,
  type AttendanceReportOption,
  type NoticeState,
  type NoticeVariant,
} from './connectors/format';
import {
  CollapsiblePanel,
  ConnectorIntegrationCard,
  ConnectorWorkflow,
  DateRangePicker,
  Field,
  FloatingNotice,
  HelpBox,
  PaginationControls,
  RecordGroupSelector,
  ShihengOrderAuthCard,
} from './connectors/widgets';
import { formatBeijingTime } from '../utils/time';

dayjs.locale('zh-cn');

const DEFAULT_SYNC_WINDOW_CONFIG: ConnectorSyncWindowConfig = { mode: 'default' };
const SHIHENG_RUN_PAGE_SIZE = 20;
const CONNECTOR_RUN_PAGE_SIZE = 20;
const EXTENDED_NEXT_MORNING_WINDOW: ConnectorSyncWindowConfig = {
  mode: 'custom_datetime',
  start_day_offset: 0,
  start_time: '00:00',
  end_day_offset: 1,
  end_time: '08:00',
};

export function ConnectorsPage() {
  const { role } = useAuthStore();
  const isAdmin = role === 'admin';
  const defaultSyncDate = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const [providers, setProviders] = useState<ConnectorProvider[]>([]);
  const [provider, setProvider] = useState('dingtalk');
  const [endpoints, setEndpoints] = useState<ConnectorEndpoint[]>([]);
  const [sources, setSources] = useState<ConnectorDataSource[]>([]);
  const [schedules, setSchedules] = useState<ConnectorSyncSchedule[]>([]);
  const [runs, setRuns] = useState<ConnectorSyncRun[]>([]);
  const [runsPage, setRunsPage] = useState<ConnectorSyncRunsPage['page'] | null>(null);
  const [runsLoadingMore, setRunsLoadingMore] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [records, setRecords] = useState<ConnectorRecordTable | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [integration, setIntegration] = useState<ConnectorIntegration | null>(null);
  const [shihengAuth, setShihengAuth] = useState<ShihengOrderAuthConfig | null>(null);
  const [shihengRuntime, setShihengRuntime] = useState<ShihengOrderRuntime | null>(null);
  const [shihengRuntimeRefreshing, setShihengRuntimeRefreshing] = useState(false);
  const [shihengRuntimeLoadingMore, setShihengRuntimeLoadingMore] = useState(false);
  const [connectorSettingsTab, setConnectorSettingsTab] = useState<'dingtalk' | 'shiheng'>('dingtalk');
  const [referenceCandidates, setReferenceCandidates] = useState<ConnectorReferenceRuleCandidate[]>([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsPageSize, setRecordsPageSize] = useState(20);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [attendanceReportOptions, setAttendanceReportOptions] = useState<AttendanceReportOption[]>([]);
  const [attendanceReportOptionsLoading, setAttendanceReportOptionsLoading] = useState(false);
  const [datasetPurpose, setDatasetPurpose] = useState('');
  const [datasetPurposeSource, setDatasetPurposeSource] = useState('');
  const [datasetPurposeLoaded, setDatasetPurposeLoaded] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [naturalText, setNaturalText] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftReason, setDraftReason] = useState('');
  const [form, setForm] = useState({
    id: '',
    endpoint_key: '',
    display_name: '',
    selected_fields: '',
    request_params_template: '{}',
    field_mapping: '{}',
    field_aliases: '{}',
    display_columns: '',
    filters: '{}',
    draft_confidence: null as number | null,
    enabled: true,
  });
  const [dateFrom, setDateFrom] = useState(defaultSyncDate);
  const [dateTo, setDateTo] = useState(defaultSyncDate);
  const [scheduleForm, setScheduleForm] = useState({
    id: '',
    data_source_id: '',
    source_sync_run_id: '',
    name: '',
    cron_expr: '0 2 * * *',
    date_window_type: 'yesterday',
    sync_window_config: DEFAULT_SYNC_WINDOW_CONFIG,
    enabled: true,
  });
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  // 轮询闭包读最新 records/recordsLoading 用 ref，避免把它们放进 effect 依赖导致 5s 定时器频繁重建。
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const recordsLoadingRef = useRef(recordsLoading);
  recordsLoadingRef.current = recordsLoading;

  const endpointByKey = useMemo(() => new Map(endpoints.map((item) => [item.endpoint_key, item])), [endpoints]);
  const sourceById = useMemo(() => new Map(sources.map((item) => [item.id, item])), [sources]);
  const completedRuns = useMemo(() => runs.filter((run) => run.status === 'completed' && run.trigger_source !== 'schedule'), [runs]);
  const completedRunOptions = useMemo(() => {
    const byTaskName = new Map<string, ConnectorSyncRun>();
    const sortedRuns = [...completedRuns].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    for (const run of sortedRuns) {
      const taskName = sourceById.get(run.data_source_id)?.display_name || run.data_source_id;
      if (!byTaskName.has(taskName)) byTaskName.set(taskName, run);
    }
    const options = [...byTaskName.values()];
    if (scheduleForm.source_sync_run_id && !options.some((run) => run.id === scheduleForm.source_sync_run_id)) {
      const selected = completedRuns.find((run) => run.id === scheduleForm.source_sync_run_id);
      if (selected) return [selected, ...options];
    }
    return options;
  }, [completedRuns, sourceById, scheduleForm.source_sync_run_id]);
  const selectedEndpoint = endpointByKey.get(form.endpoint_key);
  const selectedScheduleRun = useMemo(
    () => completedRuns.find((run) => run.id === scheduleForm.source_sync_run_id),
    [completedRuns, scheduleForm.source_sync_run_id],
  );
  const recordGroupSelector = useMemo(
    () => selectedEndpoint?.request_schema?.selectors?.find((selector) => selector.type === 'record_group') || null,
    [selectedEndpoint],
  );
  const latestRecordGroupSourceRun = useMemo(
    () => completedRuns.find((run) => sourceById.get(run.data_source_id)?.endpoint_key === recordGroupSelector?.source_endpoint_key),
    [completedRuns, sourceById, recordGroupSelector?.source_endpoint_key],
  );
  const selectedAttendanceReportKey = useMemo(() => {
    if (!recordGroupSelector) return '';
    const params = safeParseJson(form.request_params_template);
    const fields = selectorOptionFields(recordGroupSelector);
    const exactKey = attendanceReportOptionKey(
      String(params[fields.id] || ''),
      String(params[fields.type] || ''),
      String(params[fields.name] || ''),
    );
    if (attendanceReportOptions.some((option) => option.key === exactKey)) return exactKey;
    const matched = attendanceReportOptions.find((option) => (
      (params[fields.id] && option.reportId === String(params[fields.id]))
      || (params[fields.type] && option.reportType === String(params[fields.type]))
      || (params[fields.name] && option.reportName === String(params[fields.name]))
    ));
    return matched?.key || '';
  }, [attendanceReportOptions, form.request_params_template, recordGroupSelector]);
  const selectedAttendanceReportOption = useMemo(
    () => attendanceReportOptions.find((option) => option.key === selectedAttendanceReportKey),
    [attendanceReportOptions, selectedAttendanceReportKey],
  );
  const selectedAttendanceColumnIds = useMemo(() => {
    const params = safeParseJson(form.request_params_template);
    const columnParam = recordGroupSelector?.column_param || 'column_ids';
    const ids = Array.isArray(params[columnParam]) ? params[columnParam].map(String) : [];
    return new Set(ids);
  }, [form.request_params_template, recordGroupSelector?.column_param]);
  const canSaveSchedule = isAdmin && !!scheduleForm.source_sync_run_id && !!scheduleForm.data_source_id && !!scheduleForm.name.trim();

  useEffect(() => {
    void loadAll();
  }, [provider]);

  usePolling(() => {
    void refreshRuntimeState();
  }, 5000, [selectedRun, recordsPage, recordsPageSize]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!recordGroupSelector || !latestRecordGroupSourceRun) {
      setAttendanceReportOptions([]);
      return;
    }
    let ignore = false;
    setAttendanceReportOptionsLoading(true);
    getConnectorSyncRunRecords(latestRecordGroupSourceRun.id, 1, recordGroupSelector.record_page_size || 500)
      .then((recordData) => {
        if (!ignore) setAttendanceReportOptions(buildAttendanceReportOptions(recordData.rows, recordGroupSelector));
      })
      .catch(() => {
        if (!ignore) setAttendanceReportOptions([]);
      })
      .finally(() => {
        if (!ignore) setAttendanceReportOptionsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [recordGroupSelector, latestRecordGroupSourceRun?.id]);

  useEffect(() => {
    if (!form.id) {
      // 新增数据源：用途留空，随主「新增」一起保存（保存后才有 dataset_id 可挂卡）。
      setDatasetPurpose('');
      setDatasetPurposeSource('');
      setDatasetPurposeLoaded('');
      return;
    }
    let ignore = false;
    getConnectorDatasetCard(form.id)
      .then((card) => {
        if (ignore) return;
        setDatasetPurpose(card.purpose || '');
        setDatasetPurposeSource(card.purpose_source || '');
        setDatasetPurposeLoaded(card.purpose || '');
      })
      .catch(() => {
        if (ignore) return;
        setDatasetPurpose('');
        setDatasetPurposeSource('');
        setDatasetPurposeLoaded('');
      });
    return () => {
      ignore = true;
    };
  }, [form.id]);

  function showNotice(message: string, variant: NoticeVariant = 'info') {
    setNotice({ message, variant });
  }

  function mergeShihengRuntime(
    previous: ShihengOrderRuntime | null,
    next: ShihengOrderRuntime,
    mode: 'refresh' | 'append',
  ): ShihengOrderRuntime {
    if (!previous) return next;
    const runById = new Map<string, ShihengOrderRuntime['runs'][number]>();
    const orderedRuns = mode === 'append'
      ? [...previous.runs, ...next.runs]
      : [...next.runs, ...previous.runs];
    for (const run of orderedRuns) {
      if (!runById.has(run.id)) runById.set(run.id, run);
    }
    const runs = [...runById.values()];
    const hasMore = mode === 'append'
      ? Boolean(next.runs_page?.has_more)
      : Boolean(next.runs_page?.has_more || previous.runs_page?.has_more);
    return {
      ...next,
      runs,
      runs_page: {
        offset: 0,
        limit: next.runs_page?.limit ?? SHIHENG_RUN_PAGE_SIZE,
        next_offset: hasMore ? runs.length : null,
        has_more: hasMore,
      },
    };
  }

  function mergeConnectorRuns(
    previous: ConnectorSyncRun[],
    pageData: ConnectorSyncRunsPage,
    mode: 'refresh' | 'append',
  ): { runs: ConnectorSyncRun[]; page: ConnectorSyncRunsPage['page'] } {
    const byId = new Map<string, ConnectorSyncRun>();
    const orderedRuns = mode === 'append'
      ? [...previous, ...pageData.runs]
      : [...pageData.runs, ...previous];
    for (const run of orderedRuns) {
      if (!byId.has(run.id)) byId.set(run.id, run);
    }
    const mergedRuns = [...byId.values()];
    return {
      runs: mergedRuns,
      page: {
        ...pageData.page,
        next_offset: pageData.page.has_more ? mergedRuns.length : null,
      },
    };
  }

  function scheduleWindowLabel(config?: ConnectorSyncWindowConfig): string {
    if (!config || config.mode !== 'custom_datetime') return '接口默认窗口';
    return `${offsetLabel(config.start_day_offset)} ${config.start_time || '00:00'} ~ ${offsetLabel(config.end_day_offset)} ${config.end_time || '00:00'}`;
  }

  function offsetLabel(offset?: number): string {
    if (!offset) return '目标日';
    if (offset === 1) return '后一天';
    if (offset === -1) return '前一天';
    return `目标日${offset > 0 ? '+' : ''}${offset}天`;
  }

  function setScheduleWindowConfig(config: ConnectorSyncWindowConfig) {
    setScheduleForm((prev) => ({ ...prev, sync_window_config: config }));
  }

  function updateScheduleWindowConfig(patch: Partial<ConnectorSyncWindowConfig>) {
    const current = scheduleForm.sync_window_config?.mode === 'custom_datetime'
      ? scheduleForm.sync_window_config
      : EXTENDED_NEXT_MORNING_WINDOW;
    setScheduleWindowConfig({ ...current, ...patch, mode: 'custom_datetime' });
  }

  function openScheduleModal(nextForm?: typeof scheduleForm) {
    if (nextForm) setScheduleForm(nextForm);
    setScheduleModalOpen(true);
  }

  function applyAttendanceReportOption(optionKey: string) {
    if (!recordGroupSelector) return;
    const option = attendanceReportOptions.find((item) => item.key === optionKey);
    if (!option) return;
    const params = safeParseJson(form.request_params_template);
    const fields = selectorOptionFields(recordGroupSelector);
    delete params[recordGroupSelector.column_param || 'column_ids'];
    if (option.reportId) params[fields.id] = option.reportId;
    if (option.reportType) params[fields.type] = option.reportType;
    params[fields.name] = option.reportName;
    setForm((prev) => ({
      ...prev,
      display_name: prev.id || prev.display_name !== (selectedEndpoint?.name || '') ? prev.display_name : `钉钉${option.reportName}数据`,
      request_params_template: JSON.stringify(params, null, 2),
    }));
  }

  function setAttendanceColumnIds(ids: string[]) {
    const allIds = (selectedAttendanceReportOption?.columns || []).map((column) => column.id).filter(Boolean);
    const params = safeParseJson(form.request_params_template);
    const columnParam = recordGroupSelector?.column_param || 'column_ids';
    // 空选或全选都等价于“整张报表全部字段”，此时不写 column_ids，交给后端按报表类型取全部。
    if (!ids.length || (allIds.length > 0 && ids.length >= allIds.length)) {
      delete params[columnParam];
    } else {
      params[columnParam] = ids;
    }
    setForm((prev) => ({ ...prev, request_params_template: JSON.stringify(params, null, 2) }));
  }

  function toggleAttendanceColumn(columnId: string) {
    const allIds = (selectedAttendanceReportOption?.columns || []).map((column) => column.id).filter(Boolean);
    // column_ids 为空时默认视为“全部已选”，从全集开始增删。
    const current = selectedAttendanceColumnIds.size ? new Set(selectedAttendanceColumnIds) : new Set(allIds);
    if (current.has(columnId)) current.delete(columnId);
    else current.add(columnId);
    setAttendanceColumnIds([...current]);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [providerData, endpointData, integrationData, shihengAuthData, shihengRuntimeData] = await Promise.all([
        listConnectorProviders(),
        listConnectorEndpoints(provider),
        getConnectorIntegration(provider),
        getShihengOrderAuth(),
        getShihengOrderRuntime(0, SHIHENG_RUN_PAGE_SIZE),
      ]);
      setProviders(providerData);
      setEndpoints(endpointData);
      setIntegration(integrationData);
      setShihengAuth(shihengAuthData);
      setShihengRuntime(shihengRuntimeData);
      // 数据源/同步/计划等管理数据仅管理员加载（这些读接口已收紧为 admin，成员只看连接状态卡）。
      if (isAdmin) {
        const [sourceData, scheduleData, runData] = await Promise.all([
          listConnectorDataSources(),
          listConnectorSchedules(),
          listConnectorSyncRuns(0, CONNECTOR_RUN_PAGE_SIZE),
        ]);
        setSources(sourceData);
        setSchedules(scheduleData);
        setRuns(runData.runs);
        setRunsPage(runData.page);
        if (!form.endpoint_key && endpointData[0]) {
          setForm((prev) => ({
            ...prev,
            endpoint_key: endpointData[0].endpoint_key,
            display_name: endpointData[0].name,
            selected_fields: selectedFieldExample(endpointData[0]).join('\n'),
            request_params_template: JSON.stringify(selectedRequestParamsExample(endpointData[0]), null, 2),
            field_mapping: JSON.stringify(selectedFieldMappingExample(endpointData[0]), null, 2),
            field_aliases: JSON.stringify(selectedFieldAliasesExample(endpointData[0]), null, 2),
            display_columns: selectedFieldExample(endpointData[0]).join('\n'),
            filters: '{}',
            draft_confidence: null,
          }));
        }
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '加载连接器失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function refreshRuntimeState() {
    if (!isAdmin) return;  // 成员不轮询管理数据（其读接口已 admin-gated）。
    try {
      const [scheduleData, runData, shihengAuthData, shihengRuntimeData] = await Promise.all([
        listConnectorSchedules(),
        listConnectorSyncRuns(0, CONNECTOR_RUN_PAGE_SIZE),
        getShihengOrderAuth(),
        getShihengOrderRuntime(0, SHIHENG_RUN_PAGE_SIZE),
      ]);
      setSchedules(scheduleData);
      const mergedRuns = mergeConnectorRuns(runsRef.current, runData, 'refresh');
      setRuns(mergedRuns.runs);
      setRunsPage(mergedRuns.page);
      setShihengAuth(shihengAuthData);
      setShihengRuntime((previous) => mergeShihengRuntime(previous, shihengRuntimeData, 'refresh'));
      const selected = runData.runs.find((run) => run.id === selectedRun);
      if (selectedRun && selected?.status === 'completed' && !recordsRef.current && !recordsLoadingRef.current) {
        void viewRecords(selectedRun, recordsPage, recordsPageSize);
      }
    } catch {
      // 轮询刷新不打断用户正在编辑的数据源配置。
    }
  }

  async function loadMoreConnectorRuns() {
    if (!isAdmin || runsLoadingMore || !runsPage?.has_more) return;
    const nextOffset = runsPage.next_offset ?? runs.length;
    setRunsLoadingMore(true);
    try {
      const pageData = await listConnectorSyncRuns(nextOffset, CONNECTOR_RUN_PAGE_SIZE);
      const mergedRuns = mergeConnectorRuns(runsRef.current, pageData, 'append');
      setRuns(mergedRuns.runs);
      setRunsPage(mergedRuns.page);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '加载更多同步记录失败', 'error');
    } finally {
      setRunsLoadingMore(false);
    }
  }

  function handleConnectorRunsScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      void loadMoreConnectorRuns();
    }
  }

  async function refreshShihengRuntimeManually() {
    if (!isAdmin) return;
    setShihengRuntimeRefreshing(true);
    try {
      const [shihengAuthData, shihengRuntimeData] = await Promise.all([
        getShihengOrderAuth(),
        getShihengOrderRuntime(0, SHIHENG_RUN_PAGE_SIZE),
      ]);
      setShihengAuth(shihengAuthData);
      setShihengRuntime(shihengRuntimeData);
      showNotice('最近任务日志已刷新', 'success');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '刷新最近任务日志失败', 'error');
    } finally {
      setShihengRuntimeRefreshing(false);
    }
  }

  async function loadMoreShihengRuntime() {
    if (!isAdmin || shihengRuntimeLoadingMore) return;
    const page = shihengRuntime?.runs_page;
    if (!page?.has_more) return;
    const nextOffset = page.next_offset ?? shihengRuntime?.runs.length ?? SHIHENG_RUN_PAGE_SIZE;
    setShihengRuntimeLoadingMore(true);
    try {
      const shihengRuntimeData = await getShihengOrderRuntime(nextOffset, SHIHENG_RUN_PAGE_SIZE);
      setShihengRuntime((previous) => mergeShihengRuntime(previous, shihengRuntimeData, 'append'));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '加载更多任务日志失败', 'error');
    } finally {
      setShihengRuntimeLoadingMore(false);
    }
  }

  async function saveSource() {
    if (!isAdmin) return;
    try {
      const params = parseJson(form.request_params_template, '请求参数');
      const mapping = parseJson(form.field_mapping, '字段映射');
      const fieldAliases = parseJson(form.field_aliases, '字段别名');
      const filters = parseJson(form.filters, '过滤条件');
      const selectedFields = form.selected_fields.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
      const saved = await saveConnectorDataSource({
        id: form.id || undefined,
        provider,
        endpoint_key: form.endpoint_key,
        display_name: form.display_name,
        selected_fields: selectedFields,
        request_params_template: params,
        field_mapping: mapping,
        field_aliases: fieldAliases,
        display_columns: form.display_columns.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).length
          ? form.display_columns.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
          : selectedFields,
        filters,
        draft_confidence: form.draft_confidence,
        enabled: form.enabled,
      });
      // 数据用途随数据源一起保存；仅在用户改动过时写入，避免把 AI 起草的用途静默锁成手填。
      let purposeWarning = '';
      if (saved?.id && datasetPurpose.trim() !== datasetPurposeLoaded.trim()) {
        try {
          await updateConnectorDatasetPurpose(saved.id, datasetPurpose);
        } catch {
          purposeWarning = '（数据用途未能保存，可在编辑里重试）';
        }
      }
      showNotice('数据源已保存' + purposeWarning, purposeWarning ? 'info' : 'success');
      resetForm();
      await loadAll();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '保存失败', 'error');
    }
  }

  async function draftSourceFromText() {
    if (!isAdmin) return;
    if (!naturalText.trim()) {
      showNotice('请先描述想获取的数据，例如：同步员工处罚、员工奖励、转正申请审批数据', 'warning');
      return;
    }
    setDrafting(true);
    setNotice(null);
    setDraftReason('');
    try {
      const draft = await draftConnectorDataSource(provider, naturalText.trim());
      setForm((prev) => ({
        ...prev,
        endpoint_key: draft.endpoint_key,
        display_name: draft.display_name,
        selected_fields: draft.selected_fields.join('\n'),
        request_params_template: JSON.stringify(draft.request_params_template || {}, null, 2),
        field_mapping: JSON.stringify(draft.field_mapping || {}, null, 2),
        field_aliases: JSON.stringify(draft.field_aliases || {}, null, 2),
        display_columns: (draft.display_columns || draft.selected_fields).join('\n'),
        filters: JSON.stringify(draft.filters || {}, null, 2),
        draft_confidence: draft.confidence ?? null,
      }));
      if (!datasetPurpose.trim() || datasetPurposeSource !== 'manual') {
        setDatasetPurpose(naturalText.trim());
        setDatasetPurposeSource('manual');
      }
      setDraftReason([
        draft.reason || `已匹配接口：${draft.endpoint_name}`,
        draft.required_permissions.length ? `需要权限：${draft.required_permissions.join('、')}` : '',
        ...(draft.warnings || []),
      ].filter(Boolean).join('；'));
      showNotice('已根据说明生成数据源配置草稿，确认名称后点击“新增数据源”。', 'success');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '生成数据源配置失败', 'error');
    } finally {
      setDrafting(false);
    }
  }

  async function testPermission(id: string) {
    try {
      const result = await testConnectorDataSourcePermission(id);
      const permissions = result.required_permissions?.length ? `需要权限：${result.required_permissions.join('、')}` : '';
      showNotice([
        `${result.status === 'success' ? '权限可用' : '权限异常'}：${result.message}`,
        permissions,
      ].filter(Boolean).join('\n'), result.status === 'success' ? 'success' : 'warning');
      await loadAll();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '测试权限失败', 'error');
    }
  }

  function endpointNeedsDateRange(endpointKey: string): boolean {
    // 是否需要日期范围由接口目录的 request_schema.required_params 决定（权威来源），
    // 不再用 endpoint_key 子串猜测；目录里没有该接口时才回退到旧启发式。
    const schema = endpointByKey.get(endpointKey)?.request_schema;
    const required = schema?.runtime_required_params || schema?.required_params;
    if (Array.isArray(required)) return required.includes('date_from') || required.includes('date_to');
    return endpointKey.includes('data') || endpointKey.includes('instances');
  }

  async function syncSource(id: string) {
    try {
      const source = sources.find((item) => item.id === id);
      const needsDate = source ? endpointNeedsDateRange(source.endpoint_key) : false;
      await syncConnectorDataSource(id, needsDate ? dateFrom : undefined, needsDate ? dateTo : undefined);
      showNotice('已创建同步任务，可在任务栏或下方同步记录查看进度', 'success');
      await loadAll();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '启动同步失败', 'error');
    }
  }

  function confirmTestPermission(source: ConnectorDataSource) {
    setConfirmDialog({
      title: '确认测试权限',
      confirmLabel: '开始测试',
      message: (
        <div className="space-y-2 leading-6">
          <p>将使用当前租户的钉钉连接测试「{source.display_name}」接口权限。</p>
          <p className="text-xs text-slate-400">该操作会调用钉钉接口，不会写入业务数据。</p>
        </div>
      ),
      onConfirm: () => testPermission(source.id),
    });
  }

  function confirmSyncSource(source: ConnectorDataSource) {
    const needsDate = endpointNeedsDateRange(source.endpoint_key);
    setConfirmDialog({
      title: '确认同步测试',
      confirmLabel: '开始同步',
      message: (
        <div className="space-y-2 leading-6">
          <p>将启动「{source.display_name}」的手动同步测试。</p>
          {needsDate && (
            <p className="text-xs text-slate-500">
              同步范围：{dateFrom} 至 {dateTo}
            </p>
          )}
          <p className="text-xs text-slate-400">同步结果会写入原始记录和结构化记录，成功后可用于创建自动同步计划。</p>
        </div>
      ),
      onConfirm: () => syncSource(source.id),
    });
  }

  async function deleteSource(source: ConnectorDataSource) {
    try {
      await deleteConnectorDataSource(source.id);
      showNotice(`已删除数据源：${source.display_name}`, 'success');
      if (form.id === source.id) resetForm();
      await loadAll();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '删除数据源失败', 'error');
    }
  }

  function confirmDeleteSource(source: ConnectorDataSource) {
    setConfirmDialog({
      title: '确认删除数据源',
      confirmLabel: '确认删除',
      message: (
        <div className="space-y-2 leading-6">
          <p>确认删除数据源「{source.display_name}」？</p>
          <p className="text-xs text-slate-400">已同步的历史记录不会在这里删除，但这个数据源后续不能再同步。</p>
        </div>
      ),
      onConfirm: () => deleteSource(source),
    });
  }

  async function deleteSchedule(schedule: ConnectorSyncSchedule) {
    try {
      await deleteConnectorSchedule(schedule.id);
      showNotice(`已删除自动同步计划：${schedule.name}`, 'success');
      if (scheduleForm.id === schedule.id) resetScheduleForm();
      await loadAll();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '删除自动同步计划失败', 'error');
    }
  }

  async function runScheduleNow(schedule: ConnectorSyncSchedule) {
    try {
      showNotice(`正在启动自动同步计划：${schedule.name}`, 'info');
      await runConnectorScheduleNow(schedule.id);
      showNotice(`已启动自动同步计划：${schedule.name}，可在同步记录查看进度`, 'success');
      await loadAll();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '启动自动同步失败', 'error');
    }
  }

  async function deleteSyncRun(run: ConnectorSyncRun) {
    try {
      await deleteConnectorSyncRun(run.id);
      showNotice('已删除同步记录', 'success');
      if (selectedRun === run.id) {
        setSelectedRun('');
        setRecords(null);
        setRecordsPage(1);
      }
      await loadAll();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '删除同步记录失败', 'error');
    }
  }

  function confirmDeleteSyncRun(run: ConnectorSyncRun) {
    const source = sourceById.get(run.data_source_id);
    setConfirmDialog({
      title: '确认删除同步记录',
      confirmLabel: '确认删除',
      message: (
        <div className="space-y-2 leading-6">
          <p>确认删除「{source?.display_name || run.data_source_id}」这条同步记录？</p>
          <p className="text-xs text-slate-500">
            状态：{run.status}；{formatRunCounts(run)}
          </p>
          <p className="text-xs text-slate-400">这里只移除同步记录列表中的任务记录，不删除数据源配置。</p>
        </div>
      ),
      onConfirm: () => deleteSyncRun(run),
    });
  }

  function confirmDeleteSchedule(schedule: ConnectorSyncSchedule) {
    setConfirmDialog({
      title: '确认删除自动同步计划',
      confirmLabel: '确认删除',
      message: (
        <div className="space-y-2 leading-6">
          <p>确认删除自动同步计划「{schedule.name}」？</p>
          <p className="text-xs text-slate-400">删除后不会再按该计划自动拉取数据，历史同步记录会保留。</p>
        </div>
      ),
      onConfirm: () => deleteSchedule(schedule),
    });
  }

  function handleConfirmDialog() {
    const action = confirmDialog?.onConfirm;
    setConfirmDialog(null);
    void action?.();
  }

  async function viewRecords(runId: string, page = 1, pageSize = recordsPageSize) {
    if (recordsLoading && runId === selectedRun) {
      return;
    }
    const switchingRun = runId !== selectedRun;
    setSelectedRun(runId);
    setRecordsPage(page);
    setRecordsPageSize(pageSize);
    if (switchingRun) setReferenceCandidates([]);
    setRecordsLoading(true);
    try {
      const [recordData, candidateData] = await Promise.all([
        getConnectorSyncRunRecords(runId, page, pageSize),
        listConnectorReferenceRuleCandidates(runId),
      ]);
      setRecords(recordData);
      setReferenceCandidates(candidateData);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '加载结果失败', 'error');
    } finally {
      setRecordsLoading(false);
    }
  }

  async function persistReferenceRule(candidate: ConnectorReferenceRuleCandidate) {
    if (!isAdmin) return;
    try {
      await saveConnectorReferenceRule(candidate);
      setReferenceCandidates((items) => items.filter((item) => item.fingerprint !== candidate.fingerprint));
      showNotice('引用规则已沉淀到知识库，后续同步展示会优先使用该规则。', 'success');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '保存引用规则失败', 'error');
    }
  }

  async function saveSchedule() {
    if (!isAdmin) return;
    if (!scheduleForm.source_sync_run_id) {
      showNotice('请先在“同步记录”里选择一条已完成的手动同步，再创建自动同步计划。', 'warning');
      return;
    }
    if (!scheduleForm.name.trim()) {
      showNotice('请填写自动同步计划名称。', 'warning');
      return;
    }
    try {
      await saveConnectorSchedule({
        id: scheduleForm.id || undefined,
        data_source_id: scheduleForm.data_source_id,
        source_sync_run_id: scheduleForm.source_sync_run_id,
        name: scheduleForm.name,
        cron_expr: scheduleForm.cron_expr,
        timezone: 'Asia/Shanghai',
        date_window_type: scheduleForm.date_window_type,
        sync_window_config: scheduleForm.sync_window_config,
        enabled: scheduleForm.enabled,
      });
      showNotice(scheduleForm.id ? '自动同步计划已更新' : '自动同步计划已创建', 'success');
      resetScheduleForm();
      setScheduleModalOpen(false);
      await loadAll();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : '保存自动同步计划失败', 'error');
    }
  }

  function startScheduleFromRun(run: ConnectorSyncRun) {
    const source = sourceById.get(run.data_source_id);
    openScheduleModal({
      id: '',
      data_source_id: run.data_source_id,
      source_sync_run_id: run.id,
      name: source ? `${source.display_name}自动同步` : '连接器自动同步',
      cron_expr: '0 2 * * *',
      date_window_type: 'yesterday',
      sync_window_config: DEFAULT_SYNC_WINDOW_CONFIG,
      enabled: true,
    });
    showNotice('已选择这次同步作为自动同步来源，请确认计划名称和执行时间后保存。', 'info');
  }

  function editSchedule(schedule: ConnectorSyncSchedule) {
    openScheduleModal({
      id: schedule.id,
      data_source_id: schedule.data_source_id,
      source_sync_run_id: schedule.source_sync_run_id || '',
      name: schedule.name,
      cron_expr: schedule.cron_expr,
      date_window_type: schedule.date_window_type,
      sync_window_config: schedule.sync_window_config || DEFAULT_SYNC_WINDOW_CONFIG,
      enabled: schedule.enabled,
    });
  }

  function resetScheduleForm() {
    setScheduleForm({
      id: '',
      data_source_id: '',
      source_sync_run_id: '',
      name: '',
      cron_expr: '0 2 * * *',
      date_window_type: 'yesterday',
      sync_window_config: DEFAULT_SYNC_WINDOW_CONFIG,
      enabled: true,
    });
  }

  function editSource(source: ConnectorDataSource) {
    setForm({
      id: source.id,
      endpoint_key: source.endpoint_key,
      display_name: source.display_name,
      selected_fields: source.selected_fields.join('\n'),
      request_params_template: JSON.stringify(source.request_params_template || {}, null, 2),
      field_mapping: JSON.stringify(source.field_mapping || {}, null, 2),
      field_aliases: JSON.stringify(source.field_aliases || {}, null, 2),
      display_columns: (source.display_columns || source.selected_fields || []).join('\n'),
      filters: JSON.stringify(source.filters || {}, null, 2),
      draft_confidence: source.draft_confidence,
      enabled: source.enabled,
    });
  }

  function resetForm() {
    const first = endpoints[0];
	    setForm({
	      id: '',
	      endpoint_key: first?.endpoint_key || '',
	      display_name: first?.name || '',
	      selected_fields: first ? selectedFieldExample(first).join('\n') : '',
	      request_params_template: first ? JSON.stringify(selectedRequestParamsExample(first), null, 2) : '{}',
	      field_mapping: first ? JSON.stringify(selectedFieldMappingExample(first), null, 2) : '{}',
	      field_aliases: first ? JSON.stringify(selectedFieldAliasesExample(first), null, 2) : '{}',
	      display_columns: first ? selectedFieldExample(first).join('\n') : '',
	      filters: '{}',
	      draft_confidence: null,
	      enabled: true,
	    });
    setDraftReason('');
    setDatasetPurpose('');
    setDatasetPurposeSource('');
    setDatasetPurposeLoaded('');
  }

  // 非管理员只读视图：仅展示钉钉连接的配置状态，数据源配置与同步由管理员维护。
  if (!isAdmin) {
    return (
      <>
        <main className="flex-1 overflow-y-auto bg-slate-50 p-3 pb-4 md:p-6">
          <div className="w-full max-w-none space-y-5">
            <header>
              <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Enterprise Connectors</p>
              <h1 className="mt-1 text-xl font-semibold text-slate-900 md:text-2xl">企业数据连接器</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">查看本租户钉钉连接的配置状态；数据源配置与同步由管理员维护。</p>
            </header>
            <ConnectorIntegrationCard
              provider={provider}
              integration={integration}
              isAdmin={false}
              onSaved={setIntegration}
              onNotice={showNotice}
            />
          </div>
        </main>
        {notice && <FloatingNotice notice={notice} onClose={() => setNotice(null)} />}
      </>
    );
  }

  const sourceColumns: TableColumnsType<ConnectorDataSource> = [
    {
      title: '名称',
      dataIndex: 'display_name',
      key: 'display_name',
      render: (value) => <span className="text-slate-700">{String(value || '-')}</span>,
    },
    {
      title: '接口',
      dataIndex: 'endpoint_key',
      key: 'endpoint_key',
      render: (value) => <span className="text-slate-500">{endpointByKey.get(String(value))?.name || String(value || '-')}</span>,
    },
    {
      title: '权限',
      key: 'permission',
      render: (_, source) => (
        <div className="max-w-[320px]">
          <span className={source.last_permission_status === 'success' ? 'text-emerald-600' : source.last_permission_status === 'failed' ? 'text-amber-600' : 'text-slate-400'}>
            {source.last_permission_status === 'success' ? '可用' : source.last_permission_status === 'failed' ? '异常' : '未检测'}
          </span>
          {source.last_permission_message && (
            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">{source.last_permission_message}</p>
          )}
        </div>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, source) => (
        <div className="whitespace-nowrap">
          <Button onClick={() => editSource(source)} className="mr-2 h-auto border-0 p-0 text-xs font-medium text-slate-600 shadow-none hover:text-blue-700">编辑</Button>
          <Button onClick={() => confirmTestPermission(source)} className="mr-2 h-auto border-0 p-0 text-xs font-medium text-blue-600 shadow-none hover:text-blue-700">测权限</Button>
          <Button onClick={() => confirmSyncSource(source)} className="mr-2 h-auto border-0 p-0 text-xs font-medium text-violet-600 shadow-none hover:text-violet-700">同步测试</Button>
          <Button onClick={() => confirmDeleteSource(source)} className="h-auto border-0 p-0 text-xs font-medium text-red-500 shadow-none hover:text-red-600">删除</Button>
        </div>
      ),
    },
  ];

  const scheduleColumns: TableColumnsType<ConnectorSyncSchedule> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (value, schedule) => (
        <span className="text-slate-700">
          {String(value || '-')}
          {!schedule.enabled && <span className="ml-2 text-xs text-slate-400">已停用</span>}
          {schedule.last_error && <p className="mt-1 max-w-xs truncate text-xs text-red-500">{schedule.last_error}</p>}
        </span>
      ),
    },
    {
      title: '数据源',
      dataIndex: 'data_source_id',
      key: 'data_source_id',
      render: (value) => <span className="text-slate-500">{sourceById.get(String(value))?.display_name || String(value || '-')}</span>,
    },
    { title: '周期', dataIndex: 'cron_expr', key: 'cron_expr', render: (value) => <span className="text-slate-500">{String(value || '-')}</span> },
    {
      title: '同步窗口',
      key: 'sync_window',
      render: (_, schedule) => <span className="text-slate-500">{schedule.sync_window_label || scheduleWindowLabel(schedule.sync_window_config)}</span>,
    },
    {
      title: '下次执行',
      dataIndex: 'next_run_at',
      key: 'next_run_at',
      render: (value) => <span className="text-slate-500">{value ? formatBeijingTime(String(value)) : '—'}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, schedule) => (
        <div className="whitespace-nowrap">
          <Button onClick={() => editSchedule(schedule)} className="mr-2 h-auto border-0 p-0 text-xs font-medium text-slate-600 shadow-none hover:text-blue-700">编辑</Button>
          <Button onClick={() => void runScheduleNow(schedule)} className="mr-2 h-auto border-0 p-0 text-xs font-medium text-violet-600 shadow-none hover:text-violet-700">立即执行</Button>
          <Button onClick={() => confirmDeleteSchedule(schedule)} className="h-auto border-0 p-0 text-xs font-medium text-red-500 shadow-none hover:text-red-600">删除</Button>
        </div>
      ),
    },
  ];

  const recordRows = (records?.rows || []).map((row, index) => ({ ...row, __rowKey: `${records?.page || 1}-${index}` }));
  const recordColumns: TableColumnsType<Record<string, string | number | null> & { __rowKey: string }> = (records?.columns || []).map((column) => ({
    title: column.label,
    dataIndex: column.field,
    key: column.field,
    render: (value) => {
      const text = formatRecordCell(value);
      return (
        <span className="block max-w-[280px] truncate whitespace-nowrap text-slate-600" title={text}>
          {text}
        </span>
      );
    },
  }));

  return (
    <>
    <main className="flex-1 overflow-y-auto bg-slate-50 p-3 pb-4 md:p-6">
      <div className="w-full max-w-none space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Enterprise Connectors</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 md:text-2xl">企业数据连接器</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              管理员可以用自然语言生成钉钉数据源配置，也可以从接口目录选择数据类型和同步范围。系统保存原始 JSON 和结构化记录，知识库只沉淀规则、说明和用户确认后的摘要。
            </p>
          </div>
        </header>

        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-900/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">连接器栏目</h2>
                <p className="mt-1 text-sm text-slate-500">钉钉数据连接和食亨订单抓取分开配置，密钥类字段均加密保存。</p>
              </div>
              <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 md:w-fit">
                {[
                  { key: 'dingtalk' as const, label: '钉钉连接配置', status: integration?.configured ? '已配置' : '未配置' },
                  { key: 'shiheng' as const, label: '食亨订单授权', status: shihengAuth?.configured ? (shihengAuth?.enabled ? '已启用' : '已停用') : '未配置' },
                ].map((tab) => (
	                  <Button
	                    key={tab.key}
	                    htmlType="button"
	                    onClick={() => setConnectorSettingsTab(tab.key)}
                    className={`h-auto shrink-0 rounded-lg border-0 px-4 py-2 text-sm font-medium shadow-none transition ${connectorSettingsTab === tab.key ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
	                  >
	                    {tab.label}
	                    <span className={`ml-2 text-[11px] ${connectorSettingsTab === tab.key ? 'text-blue-500' : 'text-slate-400'}`}>{tab.status}</span>
	                  </Button>
                ))}
              </div>
            </div>
          </div>

          {connectorSettingsTab === 'dingtalk' ? (
            <div className="space-y-5">
              <ConnectorIntegrationCard
                provider={provider}
                integration={integration}
                isAdmin={isAdmin}
                onSaved={setIntegration}
                onNotice={showNotice}
                embedded
              />

        <CollapsiblePanel title="配置流程" subtitle="按描述数据、手动同步、创建计划三个步骤完成连接器配置。">
          <ConnectorWorkflow
            sourceCount={sources.length}
            completedRunCount={completedRuns.length}
            scheduleCount={schedules.length}
          />
        </CollapsiblePanel>

        <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <CollapsiblePanel title="数据源配置" subtitle="用自然语言生成草稿，或从接口目录手动选择数据源。">
            <div className="space-y-3">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
                <label className="block">
                  <span className="text-xs font-semibold text-blue-800">用一句话生成数据源</span>
	                  <Input.TextArea
	                    value={naturalText}
	                    onChange={(event) => setNaturalText(event.target.value)}
	                    rows={4}
	                    placeholder={'例如：同步员工处罚、员工奖励、转正申请审批数据\n例如：获取本月考勤打卡流水\n例如：获取员工通讯录和职位信息'}
	                    className="mt-2 w-full resize-none rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
	                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    '获取员工通讯录和职位信息',
                    '同步五月份考勤打卡流水',
                    '查询批量人员排班信息，只获取直营店对应部门的用户数据',
                    '获取考勤报表列表',
                    '同步员工处罚、员工奖励、转正申请审批数据',
                  ].map((example) => (
	                    <Button
	                      key={example}
	                      htmlType="button"
	                      onClick={() => setNaturalText(example)}
	                      className="h-auto rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[11px] text-blue-700 hover:bg-blue-50"
	                    >
	                      {example}
	                    </Button>
	                  ))}
	                </div>
	                <Button
	                  htmlType="button"
	                  onClick={draftSourceFromText}
	                  disabled={!isAdmin || drafting}
	                  className="mt-2 h-auto w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
	                >
	                  {drafting ? '生成中...' : '生成配置草稿'}
	                </Button>
                {draftReason && (
                  <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-blue-700">{draftReason}</p>
                )}
              </div>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">供应商</span>
	                <Select
	                  value={provider}
	                  onChange={setProvider}
	                  options={providers.map((item) => ({ value: item.provider, label: item.name, disabled: !item.enabled }))}
	                  popupMatchSelectWidth={false}
	                  className="mt-1 w-full rounded-xl border border-slate-200 text-sm"
	                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">接口目录</span>
	                <Select
	                  value={form.endpoint_key}
		                  onChange={(value) => {
		                    const endpoint = endpointByKey.get(value);
		                    setForm({
		                      ...form,
		                      endpoint_key: value,
		                      display_name: form.id ? form.display_name : endpoint?.name || '',
		                      selected_fields: form.id ? form.selected_fields : selectedFieldExample(endpoint).join('\n'),
		                      request_params_template: form.id ? form.request_params_template : JSON.stringify(selectedRequestParamsExample(endpoint), null, 2),
	                      field_mapping: form.id ? form.field_mapping : JSON.stringify(selectedFieldMappingExample(endpoint), null, 2),
	                      field_aliases: form.id ? form.field_aliases : JSON.stringify(selectedFieldAliasesExample(endpoint), null, 2),
	                      display_columns: form.id ? form.display_columns : selectedFieldExample(endpoint).join('\n'),
	                      filters: form.id ? form.filters : '{}',
	                      draft_confidence: form.id ? form.draft_confidence : null,
		                    });
	                      setDraftReason('');
		                  }}
	                  options={endpoints.map((item) => ({ value: item.endpoint_key, label: item.name }))}
	                  popupMatchSelectWidth={false}
	                  className="mt-1 w-full rounded-xl border border-slate-200 text-sm"
	                />
                <p className="mt-1 text-[11px] leading-5 text-slate-400">
                  当前接口目录共 {endpoints.length} 个接口；右侧“已配置数据源”只展示保存后的数据源，新增目录不会自动出现在那张表里。
                </p>
		              </label>
	              <Field label="数据源名称" value={form.display_name} onChange={(value) => setForm({ ...form, display_name: value })} />
                {selectedEndpoint && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                    <p>接口说明：{selectedEndpoint.name}</p>
                    <p>所需权限：{selectedEndpoint.required_permissions.length ? selectedEndpoint.required_permissions.join('、') : '暂无特殊权限说明'}</p>
                    {selectedEndpoint.permission_steps?.length > 0 && <p>开通步骤：{selectedEndpoint.permission_steps.join(' → ')}</p>}
                    {selectedEndpoint.doc_url && (
                      <a href={selectedEndpoint.doc_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700">
                        查看钉钉接口文档
                      </a>
                    )}
                    <p>字段和接口参数由 Agent 根据目录自动处理；同步完成后可在右侧查看结构化结果。</p>
                  </div>
                )}
                {recordGroupSelector && (
                  <RecordGroupSelector
                    schema={recordGroupSelector}
                    options={attendanceReportOptions}
                    value={selectedAttendanceReportKey}
                    loading={attendanceReportOptionsLoading}
                    hasSourceRun={!!latestRecordGroupSourceRun}
                    onChange={applyAttendanceReportOption}
                    columns={selectedAttendanceReportOption?.columns || []}
                    selectedColumnIds={selectedAttendanceColumnIds}
                    onToggleColumn={toggleAttendanceColumn}
                    onSelectAllColumns={() => setAttendanceColumnIds([])}
                  />
                )}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">数据用途（供 AI 识别）</span>
                  <span className="text-[11px] text-slate-400">
                    {datasetPurposeSource === 'manual' ? '手动填写' : datasetPurposeSource === 'llm' ? 'AI 起草' : (form.id ? '同步后自动生成' : '随数据源保存')}
                  </span>
                </div>
	                <Input.TextArea
	                  value={datasetPurpose}
	                  onChange={(event) => setDatasetPurpose(event.target.value)}
	                  disabled={!isAdmin}
                  rows={2}
                  placeholder="描述这份数据是什么、适合回答哪类问题；留空则同步后由 AI 起草。"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
                />
                <p className="mt-1 text-[11px] text-slate-400">随下方「{form.id ? '保存修改' : '新增数据源'}」一并保存；留空则同步时由 AI 自动起草。</p>
              </div>
	              <Checkbox className="flex items-center gap-2 text-sm text-slate-600" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })}>
	                启用数据源
	              </Checkbox>
	              <Button
	                htmlType="button"
	                disabled={!isAdmin}
	                onClick={saveSource}
	                className="h-auto w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
	              >
	                {form.id ? '保存修改' : '新增数据源'}
	              </Button>
	              {form.id && (
	                <Button htmlType="button" onClick={resetForm} className="h-auto w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
	                  取消编辑
	                </Button>
	              )}
            </div>
          </CollapsiblePanel>

          <div className="space-y-4">
            <CollapsiblePanel
              title="已配置数据源"
              subtitle="按“测权限 → 同步测试 → 查看结果 → 创建自动任务”的顺序操作。"
              actions={(
                <DateRangePicker
                  startDate={dateFrom}
                  endDate={dateTo}
                  onChange={(start, end) => {
                    setDateFrom(start);
                    setDateTo(end);
                  }}
                />
              )}
              >
                <TableDisplayFrame title="已配置数据源" filename="已配置数据源" className="rounded-xl border border-slate-100" tableClassName="overflow-auto">
                  <Table<ConnectorDataSource>
                    columns={sourceColumns}
                    dataSource={sources}
                    loading={loading}
                    locale={{ emptyText: loading ? '加载中...' : '暂无数据源' }}
                    pagination={false}
                    rowKey="id"
                    size="small"
                    scroll={{ x: 'max-content' }}
                  />
              </TableDisplayFrame>
            </CollapsiblePanel>

            <CollapsiblePanel
              title="自动同步计划"
              subtitle="先完成一次手动同步，再基于该任务保存自动计划，避免定时任务缺少参数范围。"
              actions={(
	                <Button
	                  htmlType="button"
	                  onClick={() => {
	                    resetScheduleForm();
	                    setScheduleModalOpen(true);
	                  }}
	                  className="h-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
	                >
	                  新建计划
	                </Button>
              )}
            >
              <div className="space-y-4">
                <TableDisplayFrame title="自动同步计划" filename="自动同步计划" className="rounded-xl border border-slate-100" tableClassName="overflow-auto">
                  <Table<ConnectorSyncSchedule>
                    columns={scheduleColumns}
                    dataSource={schedules}
                    locale={{ emptyText: '暂无自动同步计划' }}
                    pagination={false}
                    rowKey="id"
                    size="small"
                    scroll={{ x: 'max-content' }}
                  />
                </TableDisplayFrame>
              </div>
            </CollapsiblePanel>

            <CollapsiblePanel title="同步记录" subtitle="选择一条同步记录查看结构化数据，并可基于成功同步创建自动任务。">
              <div className="grid gap-3 md:grid-cols-[300px_1fr]">
                <div
                  className="max-h-96 overflow-auto rounded-xl border border-slate-100"
                  onScroll={handleConnectorRunsScroll}
                >
                  {runs.length === 0 ? (
                    <p className="p-4 text-sm text-slate-400">暂无同步记录</p>
                  ) : (
                    <>
                      {runs.map((run) => (
                        <div
                          key={run.id}
                          className={`border-b border-slate-100 px-3 py-3 text-sm hover:bg-slate-50 ${selectedRun === run.id ? 'bg-blue-50' : ''}`}
                        >
	                          <Button
	                            htmlType="button"
	                            onClick={() => viewRecords(run.id, 1, recordsPageSize)}
	                            className="block h-auto w-full border-0 p-0 text-left shadow-none"
	                          >
                            <p className="font-medium text-slate-700">{sources.find((item) => item.id === run.data_source_id)?.display_name || run.data_source_id}</p>
                            <p className="mt-1 text-xs text-slate-400">{run.status} · {formatRunCounts(run)}</p>
                            <div className="mt-2 space-y-1 text-xs leading-5 text-slate-500">
                              <p>同步范围：{formatSyncRange(run)}</p>
                              <p>执行时间：{formatRunExecutionTime(run)}</p>
                            </div>
                            {run.error_message && (
                              <p className="mt-2 whitespace-pre-line rounded-lg bg-red-50 px-2 py-1.5 text-xs leading-5 text-red-600">
                                {run.error_message}
                              </p>
                            )}
	                          </Button>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {run.status === 'completed' && (
	                              <Button
	                                htmlType="button"
	                                onClick={(e) => {
	                                  e.stopPropagation();
	                                  startScheduleFromRun(run);
	                                }}
	                                className="h-auto rounded-full border-0 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700 shadow-none hover:bg-violet-100"
	                              >
	                                创建自动任务
	                              </Button>
                            )}
                            {run.status !== 'pending' && run.status !== 'running' && (
	                              <Button
	                                htmlType="button"
	                                onClick={(e) => {
	                                  e.stopPropagation();
	                                  confirmDeleteSyncRun(run);
	                                }}
	                                className="h-auto rounded-full border-0 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 shadow-none hover:bg-red-100"
	                              >
	                                删除
	                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {runsLoadingMore && (
                        <p className="border-t border-slate-100 px-3 py-3 text-center text-xs text-slate-400">加载更多同步记录...</p>
                      )}
                      {!runsLoadingMore && runsPage && !runsPage.has_more && (
                        <p className="border-t border-slate-100 px-3 py-3 text-center text-xs text-slate-300">已加载全部同步记录</p>
                      )}
                    </>
                  )}
                </div>
                <div className="overflow-auto rounded-xl border border-slate-100">
                  {recordsLoading && !records ? (
                    <p className="p-6 text-center text-sm text-slate-400">正在加载结构化数据...</p>
                  ) : !records ? (
                    <p className="p-6 text-center text-sm text-slate-400">选择一条同步记录查看结构化数据</p>
                  ) : (
                    <>
                      {records.message && (
                        <p className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                          {records.message}
                        </p>
                      )}
                      {isAdmin && referenceCandidates.length > 0 && (
                        <div className="border-b border-blue-100 bg-blue-50/60 px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-blue-800">发现可沉淀的引用规则</p>
                              <p className="mt-1 text-xs leading-5 text-blue-600">确认后保存到知识库，后续同步展示优先使用这些 ID/名称映射规则。</p>
                            </div>
                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-blue-700">{referenceCandidates.length} 条候选</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {referenceCandidates.slice(0, 6).map((candidate) => (
                              <div key={candidate.fingerprint} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs text-slate-600">
                                <p className="font-medium text-slate-800">{formatReferenceCandidate(candidate)}</p>
                                <p className="mt-1 text-slate-400">样例 {candidate.sample_count} 条：{formatReferenceSamples(candidate)}</p>
	                                <Button
	                                  htmlType="button"
	                                  onClick={() => persistReferenceRule(candidate)}
	                                  className="mt-2 h-auto rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
	                                >
	                                  沉淀为知识
	                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <TableDisplayFrame
                        title="同步结构化数据"
                        filename="同步结构化数据"
                        tableClassName="overflow-auto"
                        fullscreenPagination={{
                          page: records.page,
                          pageSize: records.page_size,
                          total: records.total,
                          totalPages: records.total_pages,
                          pageSizeOptions: PAGE_SIZE_OPTIONS,
                          loading: recordsLoading,
                          onPageChange: (page) => viewRecords(selectedRun, page, records.page_size),
                          onPageSizeChange: (pageSize) => viewRecords(selectedRun, 1, pageSize),
                        }}
                      >
                        <Table<Record<string, string | number | null> & { __rowKey: string }>
                          columns={recordColumns}
                          dataSource={recordRows}
                          loading={recordsLoading}
                          locale={{ emptyText: '暂无结构化数据' }}
                          pagination={false}
                          rowKey="__rowKey"
                          size="small"
                          scroll={{ x: 'max-content' }}
                        />
                      </TableDisplayFrame>
                      <PaginationControls
                        page={records.page}
                        pageSize={records.page_size}
                        total={records.total}
                        totalPages={records.total_pages}
                        onPageChange={(page) => viewRecords(selectedRun, page, records.page_size)}
                        onPageSizeChange={(pageSize) => viewRecords(selectedRun, 1, pageSize)}
                      />
                    </>
                  )}
                </div>
              </div>
            </CollapsiblePanel>
          </div>
        </section>
            </div>
          ) : (
            <ShihengOrderAuthCard
              auth={shihengAuth}
              runtime={shihengRuntime}
              isAdmin={isAdmin}
              onSaved={setShihengAuth}
              onNotice={showNotice}
              onRefreshRuntime={refreshShihengRuntimeManually}
              runtimeRefreshing={shihengRuntimeRefreshing}
              onLoadMoreRuns={loadMoreShihengRuntime}
              runtimeLoadingMore={shihengRuntimeLoadingMore}
              embedded
            />
          )}
        </section>
      </div>
    </main>
    {scheduleModalOpen && (
      <Modal open centered footer={null} closable={false} width="min(48rem, calc(100vw - 1rem))" onCancel={() => setScheduleModalOpen(false)} styles={{ body: { padding: 0 } }}>
        <div className="max-h-[92dvh] overflow-auto rounded-2xl bg-white shadow-2xl shadow-slate-950/20 md:rounded-3xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 md:px-6 md:py-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{scheduleForm.id ? '编辑自动同步计划' : '新建自动同步计划'}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                设置何时执行、取哪个业务日期范围，以及实际请求从几点到几点。重复同步会按原始记录哈希去重。
              </p>
            </div>
	            <Button
	              htmlType="button"
	              onClick={() => setScheduleModalOpen(false)}
	              className="h-auto rounded-xl border-0 px-3 py-1.5 text-sm font-medium text-slate-400 shadow-none hover:bg-slate-100 hover:text-slate-700"
	            >
	              关闭
	            </Button>
          </div>
          <div className="space-y-4 px-4 py-4 md:px-6 md:py-5">
            <Field label="计划名称" value={scheduleForm.name} onChange={(value) => setScheduleForm({ ...scheduleForm, name: value })} />
            <label className="block">
              <span className="text-xs font-medium text-slate-500">来源手动同步任务</span>
	              <Select
	                value={scheduleForm.source_sync_run_id}
	                onChange={(value) => {
	                  const run = completedRuns.find((item) => item.id === value);
	                  setScheduleForm({
	                    ...scheduleForm,
	                    source_sync_run_id: value,
	                    data_source_id: run?.data_source_id || scheduleForm.data_source_id,
	                  });
	                }}
	                options={[
	                  { value: '', label: '请选择已完成同步任务' },
	                  ...completedRunOptions.map((run) => ({
	                    value: run.id,
	                    label: `${sourceById.get(run.data_source_id)?.display_name || run.data_source_id} · 最近成功：${run.date_from || '无日期'}${run.date_to ? `~${run.date_to}` : ''} · 获取 ${run.total_count} 条`,
	                  })),
	                ]}
	                popupMatchSelectWidth={false}
	                className="mt-1 w-full rounded-xl border border-slate-200 bg-white text-sm"
	              />
              <span className="mt-1 block text-xs leading-5 text-slate-400">
                同名任务只展示最近一次成功的手动同步。计划会复用这次同步的数据源和参数模板，只替换每次运行的日期/时间窗口。
              </span>
            </label>
            {selectedScheduleRun ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                已选择来源：{sourceById.get(selectedScheduleRun.data_source_id)?.display_name || selectedScheduleRun.data_source_id}
                {' · '}获取 {selectedScheduleRun.total_count} 条 · 新增 {selectedScheduleRun.success_count} 条
                {selectedScheduleRun.date_from && ` · ${selectedScheduleRun.date_from}${selectedScheduleRun.date_to ? ` 至 ${selectedScheduleRun.date_to}` : ''}`}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                还没有选择成功的手动同步。请先在“同步记录”中点击“创建自动任务”。
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">执行周期</span>
	                <Select
	                  value={scheduleForm.cron_expr}
	                  onChange={(value) => setScheduleForm({ ...scheduleForm, cron_expr: value })}
	                  options={[
	                    { value: '0 2 * * *', label: '每天 02:00' },
	                    { value: '0 8 * * *', label: '每天 08:00' },
	                    { value: '15 8 * * *', label: '每天 08:15' },
	                    { value: '40 8 * * *', label: '每天 08:40' },
	                    { value: '0 9 * * *', label: '每天 09:00' },
	                    { value: '0 2 * * 1', label: '每周一 02:00' },
	                    { value: '0 2 1 * *', label: '每月 1 日 02:00' },
	                  ]}
	                  popupMatchSelectWidth={false}
	                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white text-sm"
	                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">同步日期范围</span>
	                <Select
	                  value={scheduleForm.date_window_type}
	                  onChange={(value) => setScheduleForm({ ...scheduleForm, date_window_type: value })}
	                  options={[
	                    { value: 'yesterday', label: '昨天' },
	                    { value: 'last_7_days', label: '最近 7 天' },
	                    { value: 'current_month', label: '本月' },
	                    { value: 'previous_month', label: '上个月（完整自然月）' },
	                  ]}
	                  popupMatchSelectWidth={false}
	                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white text-sm"
	                />
              </label>
            </div>
            <details className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-500">高级：自定义 Cron 表达式</summary>
              <div className="mt-2"><Field label="Cron 表达式" value={scheduleForm.cron_expr} onChange={(value) => setScheduleForm({ ...scheduleForm, cron_expr: value })} /></div>
            </details>
            <HelpBox
              title="Cron 表达式说明"
              items={[
                'Cron 只控制“什么时候触发任务”，不控制取数范围；取数范围由下面的“同步日期范围”和“同步时间窗口”决定。',
                '5 段格式依次是：分钟 小时 日期 月份 星期，例如 40 8 * * *。',
                '星期取值按 0-6：0 表示周日，1 表示周一，6 表示周六；1-5 表示工作日。',
                '40 8 * * * 表示每天 08:40 执行，适合配合“昨天 + 目标日 00:00 到后一天 08:00”覆盖夜班下班卡。',
                '0 2 * * 1 表示每周一 02:00 执行，通常配合“最近 7 天”。',
                '0 2 1 * * 表示每月 1 日 02:00 执行，通常配合“上个月”同步完整自然月。',
                '支持逗号、范围和步长，例如 0 9,18 * * * 表示每天 09:00 和 18:00 执行，*/30 * * * * 表示每 30 分钟执行一次。',
              ]}
            />
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">同步时间窗口</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    这里设置实际请求钉钉的起止时间，按上面的“同步日期范围”算出目标日后再叠加。需要覆盖夜班下班卡时，可同步“目标日 00:00 到后一天 08:00”；后一天再次同步会按原始记录哈希自动去重。
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  {scheduleWindowLabel(scheduleForm.sync_window_config)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
	                <Button
	                  htmlType="button"
	                  onClick={() => setScheduleWindowConfig(DEFAULT_SYNC_WINDOW_CONFIG)}
	                  className={`h-auto rounded-full border px-3 py-1.5 text-xs font-medium ${scheduleForm.sync_window_config.mode !== 'custom_datetime' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
	                >
	                  使用接口默认窗口
	                </Button>
	                <Button
	                  htmlType="button"
	                  onClick={() => setScheduleWindowConfig(EXTENDED_NEXT_MORNING_WINDOW)}
	                  className={`h-auto rounded-full border px-3 py-1.5 text-xs font-medium ${scheduleForm.sync_window_config.mode === 'custom_datetime' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
	                >
	                  夜班窗口：目标日 00:00 到后一天 08:00
	                </Button>
              </div>
              {scheduleForm.sync_window_config.mode === 'custom_datetime' && (
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">开始日期</span>
	                    <Select
	                      value={scheduleForm.sync_window_config.start_day_offset ?? 0}
	                      onChange={(value) => updateScheduleWindowConfig({ start_day_offset: value })}
	                      options={[
	                        { value: -1, label: '前一天' },
	                        { value: 0, label: '目标日' },
	                        { value: 1, label: '后一天' },
	                      ]}
	                      popupMatchSelectWidth={false}
	                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white text-sm"
	                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">开始时间</span>
	                    <Input
	                      type="time"
	                      value={scheduleForm.sync_window_config.start_time || '00:00'}
	                      onChange={(e) => updateScheduleWindowConfig({ start_time: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">结束日期</span>
	                    <Select
	                      value={scheduleForm.sync_window_config.end_day_offset ?? 1}
	                      onChange={(value) => updateScheduleWindowConfig({ end_day_offset: value })}
	                      options={[
	                        { value: 0, label: '目标日' },
	                        { value: 1, label: '后一天' },
	                        { value: 2, label: '后两天' },
	                      ]}
	                      popupMatchSelectWidth={false}
	                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white text-sm"
	                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">结束时间</span>
	                    <Input
	                      type="time"
	                      value={scheduleForm.sync_window_config.end_time || '08:00'}
	                      onChange={(e) => updateScheduleWindowConfig({ end_time: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              )}
            </section>
	            <Checkbox className="flex items-center gap-2 text-sm text-slate-600" checked={scheduleForm.enabled} onChange={(e) => setScheduleForm({ ...scheduleForm, enabled: e.target.checked })}>
	              启用计划
	            </Checkbox>
          </div>
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 px-4 py-4 md:px-6">
		            <Button
		              htmlType="button"
		              onClick={() => setScheduleModalOpen(false)}
		              className="h-auto flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 sm:flex-none"
		            >
		              取消
	            </Button>
	            <Button
		              htmlType="button"
		              disabled={!canSaveSchedule}
		              onClick={saveSchedule}
		              className="h-auto flex-1 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40 sm:flex-none"
		            >
	              {scheduleForm.id ? '保存计划' : '创建自动同步'}
	            </Button>
          </div>
        </div>
      </Modal>
    )}
    {confirmDialog && (
      <ConfirmDialog
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={handleConfirmDialog}
        onCancel={() => setConfirmDialog(null)}
      />
    )}
    {notice && <FloatingNotice notice={notice} onClose={() => setNotice(null)} />}
    </>
  );
}
