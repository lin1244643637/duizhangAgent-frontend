import { useState } from 'react';
import { Button, Input } from 'antd';
import { downloadQueryExport } from '../api/connectors';
import { createKbEntry, deleteKbEntry, updateKbEntry } from '../api/kb';
import type { KnowledgeContext, KnowledgeSuggestion, QueryEvidence, QueryExportInfo } from '../types';
import { CollapsiblePanel } from './ui/CollapsiblePanel';

type Props = {
  evidence?: QueryEvidence | null;
  knowledgeSuggestion?: KnowledgeSuggestion | null;
  queryExport?: QueryExportInfo | null;
  knowledgeContext?: KnowledgeContext | null;
  sessionId: string;
  question: string;
  onRequery: (question: string) => void;
  isAdmin?: boolean;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** 查询依据 + 缺失知识闭环 + 全量导出面板（路线图 Step1/2/4）。 */
export function QueryEvidencePanel({ evidence, knowledgeSuggestion, queryExport, knowledgeContext, sessionId, question, onRequery, isAdmin = false }: Props) {
  const hasKnowledgeContext = hasContextItems(knowledgeContext);
  const hasKnowledgeSuggestions = (knowledgeContext?.suggestions ?? []).some((item) => item.trim());
  if (!evidence && !knowledgeSuggestion && !queryExport?.available && !hasKnowledgeContext) return null;
  return (
    <div className="ml-9 mt-1 space-y-2">
      {queryExport?.available && <ExportCard info={queryExport} sessionId={sessionId} />}
      {evidence && <FieldAugmentCard evidence={evidence} onRequery={onRequery} />}
      <KnowledgeContextSuggestions context={knowledgeContext} isAdmin={isAdmin} />
      {knowledgeSuggestion && isAdmin && (
        <KnowledgeSuggestionCard suggestion={knowledgeSuggestion} question={question} onRequery={onRequery} />
      )}
      {knowledgeSuggestion && !isAdmin && !hasKnowledgeSuggestions && <MemberKnowledgeNotice />}
      {evidence && <EvidenceCard evidence={evidence} knowledgeContext={knowledgeContext} />}
    </div>
  );
}

// 一键在「上一轮结果」上补字段：发一条 add_columns 追问（后端复用上一轮数据集按 userid 补，不重查）。
// 仅对像人员/考勤的结果展示，避免在纯财务表上提示「补姓名」。
const _AUGMENT_CANDIDATES = [
  { label: '姓名', keywords: ['姓名', '用户名', '名字', '员工名'] },
  { label: '部门', keywords: ['部门'] },
  { label: '门店', keywords: ['门店', '店铺', '店面'] },
];
const _PERSON_SIGNALS = ['考勤', '员工', '审批', '工时', '人员', '排班', '花名册', '通讯录', '钉钉', '用户', 'userid'];

function FieldAugmentCard({ evidence, onRequery }: { evidence: QueryEvidence; onRequery: (q: string) => void }) {
  if (Array.isArray(evidence.augment_fields)) {
    const inferred = evidence.augment_fields
      .map((field) => String(field || '').trim())
      .filter((field, idx, arr) => field && arr.indexOf(field) === idx);
    if (inferred.length === 0) return null;
    return <FieldAugmentButtons fields={inferred} onRequery={onRequery} />;
  }
  const haystack = `${evidence.dataset_name || ''}${evidence.fields.join('')}`.toLowerCase();
  if (!_PERSON_SIGNALS.some((s) => haystack.includes(s))) return null;
  const missing = _AUGMENT_CANDIDATES.filter(
    (c) => !c.keywords.some((k) => evidence.fields.some((f) => f.includes(k))),
  );
  if (missing.length === 0) return null;
  return <FieldAugmentButtons fields={missing.map((c) => c.label)} onRequery={onRequery} />;
}

function FieldAugmentButtons({ fields, onRequery }: { fields: string[]; onRequery: (q: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs">
      <span className="text-slate-500">在这份结果上补充字段：</span>
      {fields.map((field) => (
        <Button
          autoInsertSpace={false}
          key={field}
          onClick={() => onRequery(`把${field}加上`)}
          className="h-auto rounded-lg bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          title={`在上一轮结果上补充「${field}」，不重新查询`}
        >
          + {field}
        </Button>
      ))}
    </div>
  );
}

function ExportCard({ info, sessionId }: { info: QueryExportInfo; sessionId: string }) {
  const [state, setState] = useState<'idle' | 'downloading' | 'error'>('idle');
  const [error, setError] = useState('');

  async function download() {
    setState('downloading');
    setError('');
    try {
      await downloadQueryExport(sessionId);
      setState('idle');
    } catch (e) {
      setState('error');
      setError((e as Error).message || '导出失败');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-2.5 text-xs">
      <span className="text-slate-600">
        {info.truncated
          ? `本次共 ${info.total} 条，聊天里仅展示前 ${info.returned} 条`
          : `本次共 ${info.total} 条`}
      </span>
      <Button
        autoInsertSpace={false}
        type="primary"
        onClick={download}
        disabled={state === 'downloading'}
        className="h-auto rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {state === 'downloading' ? '导出中…' : `下载全部 ${info.total} 条 (.xlsx)`}
      </Button>
      {state === 'error' && <span className="text-red-500">{error}</span>}
    </div>
  );
}

function KnowledgeContextSuggestions({ context, isAdmin }: { context?: KnowledgeContext | null; isAdmin: boolean }) {
  const suggestions = (context?.suggestions ?? []).map((item) => item.trim()).filter(Boolean);
  if (suggestions.length === 0) return null;
  if (!isAdmin) return <MemberKnowledgeNotice />;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900">
      <p className="mb-1 font-semibold">可补充知识</p>
      <ul className="list-disc space-y-1 pl-4">
        {suggestions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function MemberKnowledgeNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900">
      当前查询缺少可稳定使用的知识配置，请联系租户管理员补充后重新查询。
    </div>
  );
}

function EvidenceCard({ evidence, knowledgeContext }: { evidence: QueryEvidence; knowledgeContext?: KnowledgeContext | null }) {
  const rc = evidence.row_counts;
  const dateText = evidence.date_range.from
    ? `${evidence.date_range.from} ~ ${evidence.date_range.to ?? ''}`
    : '不限';
  const knowledgeLabels = uniqueLabels([...evidence.knowledge_entries, ...contextLabels(knowledgeContext?.trace)]);
  const missingLabels = uniqueLabels(contextLabels(knowledgeContext?.missing));
  const funnel = [
    rc.all != null ? `数据集 ${rc.all}` : null,
    rc.date_filtered != null ? `日期内 ${rc.date_filtered}` : null,
    rc.field_filtered != null ? `字段过滤 ${rc.field_filtered}` : null,
    rc.scope_filtered != null ? `范围过滤 ${rc.scope_filtered}` : null,
    `展示 ${rc.returned}${rc.truncated ? '（已截断）' : ''}`,
  ].filter(Boolean).join(' → ');

  return (
    <CollapsiblePanel
      title="查询依据"
      summary={`数据集：${evidence.dataset_name || '—'} · ${dateText}`}
      defaultCollapsed
      className="text-xs"
    >
      <div className="space-y-1.5 px-4 py-3 text-xs text-slate-600">
        <Row label="数据集" value={evidence.dataset_name || '—'} />
        <Row label="日期范围" value={dateText} />
        <Row label="范围" value={scopeLabel(evidence.scope)} />
        {evidence.fields.length > 0 && <Row label="展示字段" value={evidence.fields.join('、')} />}
        {evidence.filters.length > 0 && (
          <Row label="筛选" value={evidence.filters.map((f) => `${f.field} ${opLabel(f.op)} ${String(f.value)}`).join('；')} />
        )}
        {evidence.group_by.length > 0 && <Row label="分组" value={evidence.group_by.join('、')} />}
        {evidence.metrics.length > 0 && <Row label="指标" value={evidence.metrics.join('、')} />}
        <Row label="记录漏斗" value={funnel} />
        <div>
          <span className="text-slate-400">应用知识：</span>
          {knowledgeLabels.length > 0 ? (
            <span className="inline-flex flex-wrap gap-1 align-middle">
              {knowledgeLabels.map((k) => (
                <span key={k} className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{k}</span>
              ))}
            </span>
          ) : (
            <span className="text-slate-400">无</span>
          )}
        </div>
        {missingLabels.length > 0 && (
          <div>
            <span className="text-slate-400">缺少知识：</span>
            <span className="inline-flex flex-wrap gap-1 align-middle">
              {missingLabels.map((k) => (
                <span key={k} className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{k}</span>
              ))}
            </span>
          </div>
        )}
        {evidence.warnings.length > 0 && (
          <div className="text-amber-600">⚠ {evidence.warnings.join('；')}</div>
        )}
      </div>
    </CollapsiblePanel>
  );
}

function KnowledgeSuggestionCard({ suggestion, question, onRequery }: { suggestion: KnowledgeSuggestion; question: string; onRequery: (q: string) => void }) {
  const [title, setTitle] = useState(suggestion.title);
  const [content, setContent] = useState(suggestion.content);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [entryId, setEntryId] = useState<string | null>(null);
  const placeholderRemains = content.includes(suggestion.editable_placeholder);

  async function save() {
    setState('saving');
    setError('');
    try {
      if (entryId) {
        await updateKbEntry(entryId, { title, content });
      } else {
        const entry = await createKbEntry({ title, content, category: suggestion.category, source: 'connector_query_suggestion' });
        setEntryId(entry.id);
      }
      setState('saved');
    } catch (e) {
      setState('error');
      setError((e as Error).message || '保存失败');
    }
  }

  async function remove() {
    if (!entryId) return;
    setState('saving');
    try {
      await deleteKbEntry(entryId);
      setEntryId(null);
      setState('idle');
    } catch (e) {
      setState('error');
      setError((e as Error).message || '删除失败');
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs">
      <p className="mb-1 font-semibold text-amber-800">需要补充知识：{suggestion.dataset_name} 缺少「{suggestion.missing_term}」的字段说明</p>
      <p className="mb-2 text-slate-600">把下面这条知识保存后，系统下次同类查询会自动使用。请把占位「{suggestion.editable_placeholder}」改成同步表里真实存在的列名。</p>

      {suggestion.available_fields.length > 0 && (
        <div className="mb-2">
          <span className="text-slate-400">可用字段：</span>
          {suggestion.available_fields.map((f) => (
            <Button
              autoInsertSpace={false}
              key={f}
              onClick={() => setContent((c) => c.replace(suggestion.editable_placeholder, f))}
              className="mr-1 mb-1 h-auto rounded bg-white px-1.5 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
              title="点击把占位替换成该字段"
            >
              {f}
            </Button>
          ))}
        </div>
      )}

      <label className="mb-1 block text-slate-500">标题</label>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-2 w-full rounded-lg border-slate-200 px-2 py-1 text-xs"
      />
      <label className="mb-1 block text-slate-500">知识正文</label>
      <Input.TextArea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="mb-2 w-full rounded-lg border-slate-200 px-2 py-1 text-xs"
      />
      {placeholderRemains && (
        <p className="mb-2 text-amber-600">提示：正文里还有占位「{suggestion.editable_placeholder}」，建议替换成真实字段名后再保存。</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          autoInsertSpace={false}
          type="primary"
          onClick={save}
          disabled={state === 'saving' || !title.trim() || !content.trim()}
          className="h-auto rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {state === 'saving' ? '保存中…' : entryId ? '更新知识' : '保存到知识库'}
        </Button>
        {state === 'saved' && (
          <Button
            autoInsertSpace={false}
            type="primary"
            onClick={() => onRequery(question)}
            className="h-auto rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
          >
            用新知识重新查询
          </Button>
        )}
        {entryId && (
          <Button
            autoInsertSpace={false}
            onClick={remove}
            disabled={state === 'saving'}
            className="h-auto rounded-lg px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
          >
            删除
          </Button>
        )}
        {state === 'saved' && <span className="text-emerald-600">已保存 ✓</span>}
        {state === 'error' && <span className="text-red-500">{error}</span>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400">{label}：</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

function scopeLabel(scope: string): string {
  return { direct: '直营', headquarters: '总部', all: '全部' }[scope] ?? scope;
}

function opLabel(op: string): string {
  return { equals: '=', in: '属于', not_contains: '不包含', contains: '包含' }[op] ?? op;
}

function hasContextItems(context?: KnowledgeContext | null): boolean {
  return (
    contextLabels(context?.trace).length > 0
    || contextLabels(context?.missing).length > 0
    || (context?.suggestions?.some((item) => item.trim()) ?? false)
  );
}

function contextLabels(items?: unknown[]): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return String(record.content || record.title || record.name || record.category || record.kind || '').trim();
      }
      return '';
    })
    .filter(Boolean);
}

function uniqueLabels(labels: string[]): string[] {
  return labels.filter((label, index, arr) => arr.indexOf(label) === index);
}
