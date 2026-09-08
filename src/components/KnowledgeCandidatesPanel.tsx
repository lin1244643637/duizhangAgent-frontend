import { useEffect, useState } from 'react';
import { Button } from 'antd';
import {
  confirmKnowledgeCandidate,
  listKnowledgeCandidates,
  rejectKnowledgeCandidate,
  type KnowledgeCandidate,
} from '../api/candidates';

const KIND_LABELS: Record<string, string> = {
  field: '字段说明',
  metric: '计算口径',
  scope: '业务范围',
  correction: '纠错（需诊断）',
  analytics_rule: '经营分析',
};

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
});

const CANDIDATE_STOPWORDS = [
  '可沉淀为常态知识',
  '可沉淀为知识',
  '可沉淀为规律',
  '可指导定价策略',
  '可进一步分析',
  '可参考历史同期',
  '可参考历史',
  '可作为稳定特征',
  '可沉淀',
  '可参考',
  '规律',
  '模式',
  '策略',
  '影响较小',
  '波动小',
  '保持稳定',
  '稳定性',
  '稳定',
  '较小',
  '下',
  '，',
  '。',
  '、',
  ' ',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function payloadHasContent(payload: Record<string, unknown>) {
  return Object.keys(payload).length > 0;
}

function getSameHolidayHistory(payload: Record<string, unknown>) {
  const featureContext = asRecord(payload.feature_context);
  const features = asRecord(featureContext?.features);
  const holiday = asRecord(features?.holiday);
  return asRecord(holiday?.same_holiday_history);
}

function buildSummary(candidate: KnowledgeCandidate) {
  const payload = candidate.structured_payload ?? {};
  const summary: string[] = [];
  const period = asText(payload.period);
  const granularity = asText(payload.granularity);
  const holidayHistory = getSameHolidayHistory(payload);

  if (period) summary.push(`周期：${period}`);
  if (granularity) summary.push(`粒度：${granularity}`);

  if (holidayHistory) {
    const sampleCount = asNumber(holidayHistory.sample_count);
    const restDayAvg = asNumber(holidayHistory.rest_day_avg_net_income);
    const workdayAvg = asNumber(holidayHistory.workday_avg_net_income);
    const liftPct = asNumber(holidayHistory.raw_rest_day_lift_pct);

    if (sampleCount !== null) summary.push(`样本：${sampleCount}`);
    if (restDayAvg !== null) summary.push(`休息日均值：${currency.format(restDayAvg)}`);
    if (workdayAvg !== null) summary.push(`工作日均值：${currency.format(workdayAvg)}`);
    if (liftPct !== null) summary.push(`休息日提升：${(liftPct * 100).toFixed(2)}%`);
  }

  return summary;
}

function candidateGroupKey(candidate: KnowledgeCandidate) {
  let key = `${candidate.kind}:${candidate.suggested_category}:${candidate.suggested_title}`.trim().toLowerCase();
  CANDIDATE_STOPWORDS.forEach((token) => {
    key = key.split(token).join('');
  });
  return key.slice(0, 120);
}

function groupCandidates(items: KnowledgeCandidate[]) {
  const groups: KnowledgeCandidate[][] = [];
  const indexByKey = new Map<string, number>();
  items.forEach((item) => {
    const key = candidateGroupKey(item);
    const index = indexByKey.get(key);
    if (index === undefined) {
      indexByKey.set(key, groups.length);
      groups.push([item]);
    } else {
      groups[index].push(item);
    }
  });
  return groups;
}

/**
 * 管理员「待确认知识候选」面板（方案 P3 §11）。
 * 对话中识别到的可沉淀知识/纠错以草稿列出，确认后写入知识库被后续查询召回。
 * 设计上无候选/加载中均不渲染，保证嵌入既有知识库页时零干扰。
 */
export function KnowledgeCandidatesPanel() {
  const [items, setItems] = useState<KnowledgeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [lastSaved, setLastSaved] = useState<{
    title: string;
    category: string;
    kbEntryId: string | null;
  } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await listKnowledgeCandidates('draft'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function saveCandidate(candidate: KnowledgeCandidate) {
    setBusyId(candidate.id);
    try {
      const result = await confirmKnowledgeCandidate(candidate.id);
      setLastSaved({
        title: candidate.suggested_title,
        category: candidate.suggested_category,
        kbEntryId: result.kb_entry_id,
      });
      setItems((prev) => prev.filter((x) => x.id !== candidate.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusyId('');
    }
  }

  async function reject(candidate: KnowledgeCandidate) {
    setBusyId(candidate.id);
    try {
      await rejectKnowledgeCandidate(candidate.id);
      setItems((prev) => prev.filter((x) => x.id !== candidate.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusyId('');
    }
  }

  if (loading || (items.length === 0 && !lastSaved)) return null;
  const groups = groupCandidates(items);

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-1">
        待确认知识候选 <span className="text-amber-600">({groups.length} 组)</span>
        <span className="ml-2 text-xs font-normal text-slate-400">共 {items.length} 条</span>
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        系统从对话中识别到的可沉淀知识；确认后写入知识库被后续查询召回，纠错类仅作复核、不自动成规则。
      </p>
      {lastSaved && (
        <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          已保存到知识库。可在知识库中搜索标题「{lastSaved.title}」查看正式条目，分类：
          {lastSaved.category}
          {lastSaved.kbEntryId ? `，条目 ID：${lastSaved.kbEntryId}` : ''}。
        </div>
      )}
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      <div className="space-y-2">
        {groups.map((group) => {
          const c = group[0];
          const summary = buildSummary(c);
          const hasPayload = payloadHasContent(c.structured_payload);
          const expanded = Boolean(expandedIds[c.id]);
          const hasSimilar = group.length > 1;

          return (
            <div key={c.id} className="border border-slate-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                  {KIND_LABELS[c.kind] ?? c.kind}
                </span>
                <span className="text-sm font-medium text-slate-700">{c.suggested_title}</span>
                {hasSimilar && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    相似 {group.length} 条
                  </span>
                )}
                <span className="text-xs text-slate-400 ml-auto">{c.suggested_category}</span>
              </div>
              <p className="text-xs text-slate-500 mb-2 break-all">来源：{c.source_text}</p>
              {hasSimilar && (
                <details className="mb-2 text-xs text-slate-500">
                  <summary className="cursor-pointer text-slate-600">查看相似候选</summary>
                  <ul className="mt-1 list-disc pl-5 space-y-1">
                    {group.slice(1).map((item) => (
                      <li key={item.id}>{item.suggested_title}</li>
                    ))}
                  </ul>
                </details>
              )}
              {summary.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {summary.map((text) => (
                    <span key={text} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      {text}
                    </span>
                  ))}
                </div>
              )}
              {expanded && (
                <pre className="mb-2 max-h-72 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-600">
                  {`structured_payload\n${JSON.stringify(c.structured_payload, null, 2)}`}
                </pre>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busyId === c.id}
                  onClick={() => saveCandidate(c)}
                  className="h-auto px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer disabled:opacity-50"
                >
                  保存到知识库
                </Button>
                <Button
                  disabled={busyId === c.id}
                  onClick={() => reject(c)}
                  className="h-auto px-3 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 cursor-pointer disabled:opacity-50"
                >
                  忽略
                </Button>
                {hasPayload && (
                  <Button
                    htmlType="button"
                    onClick={() => setExpandedIds((prev) => ({ ...prev, [c.id]: !expanded }))}
                    className="h-auto px-3 py-1 text-xs bg-white text-slate-600 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer"
                  >
                    {expanded ? '收起详情' : '查看详情'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
