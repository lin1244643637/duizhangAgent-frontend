/** 对账模板列表卡片（从 KnowledgeBasePage 机械拆出，行为不变）。 */

import { Button } from 'antd';
import type { ReconcileTemplateSummary } from '../../types';

type Props = {
  isAdmin: boolean;
  templateSaving: boolean;
  templateSummary: ReconcileTemplateSummary[];
  handleImportSeeds: () => void;
  openEditTemplate: (tpl: ReconcileTemplateSummary) => void;
  handleDeleteTemplate: (tpl: ReconcileTemplateSummary) => void;
};

export function ReconcileTemplateSection({
  isAdmin,
  templateSaving,
  templateSummary,
  handleImportSeeds,
  openEditTemplate,
  handleDeleteTemplate,
}: Props) {
  return (
        <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">对账模板</h3>
              <p className="text-xs text-slate-500 mt-1">
                当前租户已配置 {templateSummary.length} 个模板。账单解析只使用这里的模板。
              </p>
	            </div>
	            {isAdmin && (
		              <Button
		                autoInsertSpace={false}
		                onClick={handleImportSeeds}
		                disabled={templateSaving}
		                className="h-10 rounded-xl border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
		              >
	                导入种子模板
	              </Button>
	            )}
          </div>
          {templateSummary.length > 0 && (
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
              {templateSummary.map((tpl) => (
                <div key={tpl.id} className="border border-slate-100 rounded-lg px-3 py-2 bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700 truncate">{tpl.platform_name || tpl.provider}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
	                      <span className="text-[10px] text-slate-400">{tpl.provider}</span>
	                      {isAdmin && (
	                        <Button
	                          autoInsertSpace={false}
	                          type="text"
	                          onClick={() => openEditTemplate(tpl)}
	                          className="h-auto border-0 p-0 text-[10px] text-blue-500 shadow-none transition-colors hover:text-blue-600"
	                        >
	                          编辑
	                        </Button>
	                      )}
	                      {isAdmin && (
	                        <Button
	                          autoInsertSpace={false}
	                          type="text"
	                          onClick={() => handleDeleteTemplate(tpl)}
	                          disabled={templateSaving}
	                          className="h-auto border-0 p-0 text-[10px] text-red-500 shadow-none transition-colors hover:text-red-600 disabled:opacity-40"
	                        >
	                          删除
	                        </Button>
	                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">
                    {tpl.file_keywords.join('、') || '无关键词'} · {tpl.sheet_count} sheet · {tpl.field_count} 字段
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
  );
}
