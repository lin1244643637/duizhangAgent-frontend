/** 知识条目列表（从 KnowledgeBasePage 机械拆出，行为不变；entries.length 改经 totalEntryCount 传入）。 */

import { Button } from 'antd';
import type { KbEntry } from '../../types';
import { SOURCE_LABEL, formatTime, isLongKnowledgeContent } from './helpers';

type Props = {
  isAdmin: boolean;
  loading: boolean;
  totalEntryCount: number;
  visibleEntries: KbEntry[];
  expandedEntries: Set<string>;
  toggleEntryExpanded: (entryId: string) => void;
  displayCategoryLabel: (category: string) => string;
  openEdit: (entry: KbEntry) => void;
  handleDelete: (entry: KbEntry) => void;
};

export function KnowledgeEntryList({
  isAdmin,
  loading,
  totalEntryCount,
  visibleEntries,
  expandedEntries,
  toggleEntryExpanded,
  displayCategoryLabel,
  openEdit,
  handleDelete,
}: Props) {
  return (
    <>
        {loading && totalEntryCount === 0 ? (
          <p className="text-center text-slate-400 text-sm mt-10">加载中…</p>
        ) : visibleEntries.length === 0 ? (
          <p className="text-center text-slate-400 text-sm mt-10">
            暂无知识条目{isAdmin ? '，点右上角「新增条目」添加' : '，请联系管理员录入'}
          </p>
        ) : (
          <div className="space-y-3">
            {visibleEntries.map((e) => {
              const expanded = expandedEntries.has(e.id);
              const canToggleContent = isLongKnowledgeContent(e.content);
              return (
              <div key={e.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-800">{e.title}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100">
                        {displayCategoryLabel(e.category)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-500 border border-slate-200">
                        {SOURCE_LABEL[e.source] ?? e.source}
                      </span>
                    </div>
                    <p className={`text-sm leading-6 text-slate-600 mt-2 whitespace-pre-wrap break-words ${
                      !expanded && canToggleContent
                        ? 'overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]'
                        : ''
                    }`}>
                      {e.content}
	                    </p>
	                    {canToggleContent && (
	                      <Button
	                        autoInsertSpace={false}
	                        type="text"
	                        htmlType="button"
	                        onClick={() => toggleEntryExpanded(e.id)}
	                        className="mt-2 h-auto min-h-8 rounded-lg border-0 px-2 text-xs font-medium text-blue-600 shadow-none transition-colors hover:bg-blue-50 hover:text-blue-700"
	                        aria-expanded={expanded}
	                      >
	                        {expanded ? '收起' : '查看全部'}
	                      </Button>
	                    )}
                    <p className="text-[11px] text-slate-400 mt-2">
                      {e.created_by} · 更新于 {formatTime(e.updated_at)}
                    </p>
                  </div>
	                  {isAdmin && (
	                    <div className="flex flex-col gap-1 flex-shrink-0">
	                      <Button
	                        autoInsertSpace={false}
	                        type="text"
	                        onClick={() => openEdit(e)}
	                        className="h-auto rounded-md border-0 px-2 py-1 text-xs text-blue-600 shadow-none transition-colors hover:bg-blue-50"
	                      >
	                        编辑
	                      </Button>
	                      <Button
	                        autoInsertSpace={false}
	                        type="text"
	                        onClick={() => handleDelete(e)}
	                        className="h-auto rounded-md border-0 px-2 py-1 text-xs text-red-500 shadow-none transition-colors hover:bg-red-50"
	                      >
	                        删除
	                      </Button>
	                    </div>
	                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
    </>
  );
}
