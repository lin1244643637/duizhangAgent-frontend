/** 财务流程与报表模板卡片（从 KnowledgeBasePage 机械拆出，行为不变；prop 名与父组件局部名一致）。 */

import type { Dispatch, SetStateAction } from 'react';
import { Button, Input, Upload } from 'antd';
import type { KnowledgeReadiness, ReportTemplateDetail, ReportTemplateSummary } from '../../types';
import { categoryLabel, formatTime } from './helpers';

export type EditingInstruction = { templateId: string | null; itemId: string; text: string } | null;

type Props = {
  isAdmin: boolean;
  templateSaving: boolean;
  readiness: KnowledgeReadiness | null;
  reportTemplates: ReportTemplateSummary[];
  reportTemplateDetails: Record<string, ReportTemplateDetail>;
  globalInstructionOpen: boolean;
  setGlobalInstructionOpen: Dispatch<SetStateAction<boolean>>;
  globalInstructionText: string;
  setGlobalInstructionText: Dispatch<SetStateAction<string>>;
  seedOpen: boolean;
  setSeedOpen: Dispatch<SetStateAction<boolean>>;
  seedPeriod: string;
  setSeedPeriod: Dispatch<SetStateAction<string>>;
  templateInstructionOpen: Record<string, boolean>;
  setTemplateInstructionOpen: Dispatch<SetStateAction<Record<string, boolean>>>;
  templateInstructionText: Record<string, string>;
  setTemplateInstructionText: Dispatch<SetStateAction<Record<string, string>>>;
  editingInstruction: EditingInstruction;
  setEditingInstruction: Dispatch<SetStateAction<EditingInstruction>>;
  handleFinanceProcessFile: (file: File | null) => void;
  handleGlobalReportInstructionFile: (file: File | null) => void;
  handleReportTemplateFile: (file: File | null) => void;
  handleCarryforwardSeedFile: (file: File | null) => void;
  handleGlobalReportInstructionText: () => void;
  toggleReportTemplateDetail: (tpl: ReportTemplateSummary) => void;
  handleDeleteReportTemplate: (tpl: ReportTemplateSummary) => void;
  handleTemplateInstructionFile: (tpl: ReportTemplateSummary, file: File | null) => void;
  handleTemplateInstructionText: (tpl: ReportTemplateSummary) => void;
  handleUpdateInstruction: () => void;
  handleDeleteInstruction: (templateId: string | null, itemId: string, label: string) => void;
};

export function FinanceTemplatePanel({
  isAdmin,
  templateSaving,
  readiness,
  reportTemplates,
  reportTemplateDetails,
  globalInstructionOpen,
  setGlobalInstructionOpen,
  globalInstructionText,
  setGlobalInstructionText,
  seedOpen,
  setSeedOpen,
  seedPeriod,
  setSeedPeriod,
  templateInstructionOpen,
  setTemplateInstructionOpen,
  templateInstructionText,
  setTemplateInstructionText,
  editingInstruction,
  setEditingInstruction,
  handleFinanceProcessFile,
  handleGlobalReportInstructionFile,
  handleReportTemplateFile,
  handleCarryforwardSeedFile,
  handleGlobalReportInstructionText,
  toggleReportTemplateDetail,
  handleDeleteReportTemplate,
  handleTemplateInstructionFile,
  handleTemplateInstructionText,
  handleUpdateInstruction,
  handleDeleteInstruction,
}: Props) {
  const readinessSatisfied = Array.isArray(readiness?.satisfied) ? readiness.satisfied : [];
  const readinessBlockingItems = Array.isArray(readiness?.blocking_items) ? readiness.blocking_items : [];
  const readinessWarnings = Array.isArray(readiness?.warnings) ? readiness.warnings : [];
  const readinessMissingItems = [...readinessBlockingItems, ...readinessWarnings];

  return (
        <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">财务流程与报表模板</h3>
              <p className="text-xs text-slate-500 mt-1">
                上传收入流程 Word 作为内部知识；上传营业收入/回款 Excel 作为对话生成报表的模板。
              </p>
            </div>
            {isAdmin && (
              <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                <Upload
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  showUploadList={false}
                  disabled={templateSaving}
                  beforeUpload={(file) => { handleFinanceProcessFile(file); return Upload.LIST_IGNORE; }}
                >
                  <Button autoInsertSpace={false} disabled={templateSaving} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50">上传流程 Word</Button>
                </Upload>
                <Upload
                  accept=".docx,.md,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
                  showUploadList={false}
                  disabled={templateSaving}
                  beforeUpload={(file) => { handleGlobalReportInstructionFile(file); return Upload.LIST_IGNORE; }}
                >
                  <Button autoInsertSpace={false} disabled={templateSaving} className="h-10 rounded-xl border border-indigo-200 px-3 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50">上传全局说明</Button>
                </Upload>
                <Upload
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  showUploadList={false}
                  disabled={templateSaving}
                  beforeUpload={(file) => { handleReportTemplateFile(file); return Upload.LIST_IGNORE; }}
                >
                  <Button autoInsertSpace={false} disabled={templateSaving} className="h-10 rounded-xl border-0 bg-indigo-500 px-3 text-xs font-medium text-white transition-colors hover:bg-indigo-600">上传报表模板</Button>
                </Upload>
                <Button
                  autoInsertSpace={false}
                  onClick={() => setSeedOpen((open) => !open)}
                  className="h-10 rounded-xl border-amber-200 px-3 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50"
                >
                  {seedOpen ? '取消' : '回款表首月期初'}
                </Button>
              </div>
            )}
          </div>
          {readiness && (
            <div className={`mt-3 rounded-lg border px-3 py-2 ${
              readiness.status === 'blocked'
                ? 'bg-red-50 border-red-100'
                : readiness.status === 'warning'
                  ? 'bg-amber-50 border-amber-100'
                  : 'bg-emerald-50 border-emerald-100'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs font-semibold ${
                  readiness.status === 'blocked'
                    ? 'text-red-700'
                    : readiness.status === 'warning'
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                }`}>
                  租户配置完整度：{readiness.status === 'blocked' ? '缺少必要配置' : readiness.status === 'warning' ? '可运行，建议补充' : '完整'}
                </p>
                <span className="text-[10px] text-slate-400">
                  已满足 {readinessSatisfied.length} 项
                </span>
              </div>
              {readinessMissingItems.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {readinessMissingItems.slice(0, 4).map((item) => (
                    <div key={item.code} className="rounded bg-white/70 px-2 py-1">
                      <p className="text-[11px] font-medium text-slate-700">
                        {item.blocking ? '必须补充' : '建议补充'}：{item.title}
                        <span className="ml-1 text-slate-400">/保存到：{categoryLabel(item.category)}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{item.message}</p>
                      {isAdmin && item.example_content && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-indigo-600 cursor-pointer">查看自然语言示例</summary>
                          <pre className="mt-1 max-h-28 overflow-auto rounded bg-slate-900 px-2 py-1 text-[10px] leading-relaxed text-slate-100 whitespace-pre-wrap">
                            {item.example_content}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-emerald-700">当前关键知识配置完整，可以生成报表和启动对账。</p>
              )}
            </div>
          )}
          {isAdmin && (
            <div className="mt-3 border border-indigo-100 rounded-lg bg-indigo-50/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-slate-600">全局报表说明</p>
                <Button
                  autoInsertSpace={false}
                  type="text"
                  onClick={() => setGlobalInstructionOpen((open) => !open)}
                  className="h-9 border-0 px-2 py-0 text-[11px] font-medium text-indigo-600 shadow-none hover:text-indigo-700"
                >
                  {globalInstructionOpen ? '取消输入' : '新增说明'}
                </Button>
              </div>
              {globalInstructionOpen && (
                <>
                  <Input.TextArea
                    value={globalInstructionText}
                    onChange={(e) => setGlobalInstructionText(e.target.value)}
                    placeholder="例如：主营业务收入 sheet 中，实收行按各门店 net_amount 填充；没有数据的门店清空。"
                    rows={3}
                    className="mt-2 w-full text-xs bg-white border border-indigo-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 resize-y"
                  />
                  <div className="mt-2 flex items-center justify-end">
                    <Button
                      autoInsertSpace={false}
                      onClick={handleGlobalReportInstructionText}
                      disabled={templateSaving || !globalInstructionText.trim()}
                      className="h-auto rounded-lg bg-indigo-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
                    >
                      保存输入说明
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
          {isAdmin && seedOpen && (
            <div className="mt-3 border border-amber-100 rounded-lg bg-amber-50/60 p-3">
              <p className="text-[11px] font-medium text-slate-700">营业收入回款表 · 首月期初</p>
              <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                首次使用某账期时，上传它<strong>上一月</strong>的《营业收入回款表》结果 Excel（带「本月余额」列和琥珀色未回款标记）。
                系统自动读取上月期末余额作本月期初、各店未回款作各店期初未结。之后每月生成报表会自动逐月结转，无需再上传。
              </p>
              <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="text-[11px] text-slate-600">
                  播种账期
	                  <Input
	                    type="month"
	                    value={seedPeriod}
	                    onChange={(e) => setSeedPeriod(e.target.value)}
	                    className="ml-2 w-auto rounded-lg border-amber-200 bg-white px-2 py-1 text-xs focus:ring-2 focus:ring-amber-100"
	                  />
                </label>
                <Upload
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  showUploadList={false}
                  disabled={templateSaving}
                  beforeUpload={(file) => { handleCarryforwardSeedFile(file); return Upload.LIST_IGNORE; }}
                >
                  <Button autoInsertSpace={false} disabled={templateSaving} className="h-10 rounded-lg border-0 bg-amber-500 px-3 text-[11px] font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-40">上传上月回款表</Button>
                </Upload>
              </div>
            </div>
          )}
          {reportTemplates.length > 0 && (
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
              {reportTemplates.map((tpl) => (
                <div key={tpl.id} className="border border-indigo-100 rounded-lg px-3 py-2 bg-indigo-50/60">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700 truncate">{tpl.template_label}</p>
                    {isAdmin && (
	                      <Button
	                        autoInsertSpace={false}
	                        type="text"
	                        onClick={() => handleDeleteReportTemplate(tpl)}
	                        disabled={templateSaving}
	                        className="h-auto border-0 p-0 text-[10px] text-red-500 shadow-none transition-colors hover:text-red-600 disabled:opacity-40"
	                      >
	                        删除
	                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">
                    {tpl.original_filename} · {tpl.sheet_count} sheet · 更新于 {formatTime(tpl.updated_at)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    全局说明：{tpl.has_global_instruction ? '已配置' : '未配置'} · 模板说明：{tpl.has_template_instruction ? `已配置 ${formatTime(tpl.instruction_updated_at || '')}` : '未配置'}
                  </p>
	                  <Button
	                    autoInsertSpace={false}
	                    type="text"
	                    onClick={() => toggleReportTemplateDetail(tpl)}
	                    disabled={templateSaving}
	                    className="mt-2 h-auto border-0 p-0 text-[11px] font-medium text-indigo-600 shadow-none transition-colors hover:text-indigo-700 disabled:opacity-40"
	                  >
	                    {reportTemplateDetails[tpl.id] ? '收起解析预览' : '查看解析预览'}
	                  </Button>
                  {reportTemplateDetails[tpl.id] && (
                    <div className="mt-2 rounded-lg border border-indigo-100 bg-white px-2 py-2">
                      <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                        {(reportTemplateDetails[tpl.id].sheets ?? []).map((rawSheet, idx) => {
                          const sheet = rawSheet as {
                            name?: string;
                            header_row?: number;
                            store_columns?: Array<{ name?: string; col?: number }>;
                            formula_count?: number;
                            fillable_count?: number;
                          };
                          const stores = Array.isArray(sheet.store_columns) ? sheet.store_columns : [];
                          return (
                            <div key={`${sheet.name ?? 'sheet'}-${idx}`} className="rounded-md bg-slate-50 px-2 py-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-medium text-slate-700 truncate">{sheet.name || `Sheet ${idx + 1}`}</p>
                                <span className="text-[10px] text-slate-400 flex-shrink-0">表头第 {sheet.header_row ?? '-'} 行</span>
                              </div>
                              <p className="mt-1 text-[10px] text-slate-500">
                                门店列 {stores.length} 个 · 公式 {sheet.formula_count ?? 0} 个 · 可填常量 {sheet.fillable_count ?? 0} 个
                              </p>
                              {stores.length > 0 && (
                                <p className="mt-1 text-[10px] text-slate-500 truncate">
                                  {stores.map((s) => s.name).filter(Boolean).join('、')}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 border-t border-indigo-50 pt-2 space-y-2">
                        {[
                          ['全局说明', reportTemplateDetails[tpl.id].global_instruction],
                          ['模板说明', reportTemplateDetails[tpl.id].template_instruction],
                        ].map(([label, instruction]) => {
                          const item = instruction as ReportTemplateDetail['global_instruction'];
                          const text = item?.text?.trim();
                          const rules = Array.isArray(item?.rules) ? item.rules : [];
                          const instructionItems = Array.isArray(item?.items) && item.items.length > 0
                            ? item.items
                            : text
                              ? [{ id: 'legacy', text, rules }]
                              : [];
                          const isGlobalInstruction = String(label) === '全局说明';
                          return (
                            <div key={String(label)} className="rounded-md bg-indigo-50/60 px-2 py-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-medium text-slate-700">{String(label)}</p>
                                <span className="text-[10px] text-slate-400">{instructionItems.length ? `${instructionItems.length} 条说明 · 规则 ${rules.length} 条` : '未配置'}</span>
                              </div>
                              {instructionItems.map((instructionItem, itemIdx) => {
                                const instructionId = String(instructionItem.id ?? 'legacy');
                                const editing = editingInstruction?.templateId === (isGlobalInstruction ? null : tpl.id)
                                  && editingInstruction.itemId === instructionId;
                                return (
                                  <div key={`${instructionId}-${itemIdx}`} className="mt-1 rounded bg-white/70 px-2 py-1">
                                    {editing ? (
                                      <div className="space-y-1">
	                                        <Input.TextArea
	                                          value={editingInstruction.text}
	                                          onChange={(e) => setEditingInstruction((prev) => prev ? { ...prev, text: e.target.value } : prev)}
                                          rows={3}
	                                          className="w-full text-[10px] bg-white border border-indigo-100 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-y"
	                                        />
	                                        <div className="flex justify-end gap-2">
	                                          <Button
	                                            autoInsertSpace={false}
	                                            type="text"
	                                            onClick={() => setEditingInstruction(null)}
	                                            className="h-auto border-0 p-0 text-[10px] text-slate-500 shadow-none hover:text-slate-700"
	                                          >
	                                            取消
	                                          </Button>
	                                          <Button
	                                            autoInsertSpace={false}
	                                            type="text"
	                                            onClick={handleUpdateInstruction}
	                                            disabled={templateSaving || !editingInstruction.text.trim()}
	                                            className="h-auto border-0 p-0 text-[10px] font-medium text-indigo-600 shadow-none hover:text-indigo-700 disabled:opacity-40"
	                                          >
	                                            保存修改
	                                          </Button>
	                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex items-start justify-between gap-2">
                                          <p className="text-[10px] leading-relaxed text-slate-600 whitespace-pre-wrap max-h-20 overflow-y-auto flex-1">
                                            {String(instructionItem.text ?? '')}
                                          </p>
                                          {isAdmin && (
                                            <div className="flex flex-shrink-0 items-center gap-2">
	                                              <Button
	                                                autoInsertSpace={false}
	                                                type="text"
	                                                onClick={() => setEditingInstruction({
                                                  templateId: isGlobalInstruction ? null : tpl.id,
                                                  itemId: instructionId,
                                                  text: String(instructionItem.text ?? ''),
                                                })}
	                                                className="h-auto border-0 p-0 text-[10px] font-medium text-indigo-600 shadow-none hover:text-indigo-700"
	                                              >
	                                                编辑
	                                              </Button>
	                                              <Button
	                                                autoInsertSpace={false}
	                                                type="text"
	                                                onClick={() => handleDeleteInstruction(
                                                  isGlobalInstruction ? null : tpl.id,
                                                  instructionId,
                                                  String(label),
	                                                )}
	                                                disabled={templateSaving}
	                                                className="h-auto border-0 p-0 text-[10px] font-medium text-rose-500 shadow-none hover:text-rose-600 disabled:opacity-40"
	                                              >
	                                                删除
	                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                              {rules.length > 0 && (
                                <p className="mt-1 text-[10px] text-indigo-600 truncate">
                                  {rules.map((rule) => `${String(rule.metric ?? '-')}:${String(rule.sheet_contains ?? rule.label_contains ?? rule.row ?? '-')}`).join('；')}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {isAdmin && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-3">
                        <Button
                          autoInsertSpace={false}
                          type="text"
                          onClick={() => setTemplateInstructionOpen((prev) => ({ ...prev, [tpl.id]: !prev[tpl.id] }))}
                          disabled={templateSaving}
                          className="h-9 border-0 px-2 py-0 text-[11px] font-medium text-indigo-600 shadow-none transition-colors hover:text-indigo-700 disabled:opacity-40"
                        >
                          {templateInstructionOpen[tpl.id] ? '取消输入' : '新增说明'}
                        </Button>
                        <Upload
                          accept=".docx,.md,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
                          showUploadList={false}
                          disabled={templateSaving}
                          beforeUpload={(file) => { handleTemplateInstructionFile(tpl, file); return Upload.LIST_IGNORE; }}
                        >
                          <Button autoInsertSpace={false} disabled={templateSaving} className="h-9 border-0 px-2 py-0 text-[11px] font-medium text-indigo-600 shadow-none transition-colors hover:text-indigo-700">上传说明文件</Button>
                        </Upload>
                      </div>
                      {templateInstructionOpen[tpl.id] && (
                        <div className="space-y-2">
                          <Input.TextArea
                            value={templateInstructionText[tpl.id] ?? ''}
                            onChange={(e) => setTemplateInstructionText((prev) => ({ ...prev, [tpl.id]: e.target.value }))}
                            placeholder="输入这个模板的专用说明"
                            rows={2}
                            className="w-full text-[11px] bg-white border border-indigo-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 resize-y"
                          />
                          <div className="flex justify-end">
                            <Button
                              autoInsertSpace={false}
                              onClick={() => handleTemplateInstructionText(tpl)}
                              disabled={templateSaving || !(templateInstructionText[tpl.id] ?? '').trim()}
                              className="h-10 rounded-lg bg-indigo-500 px-3 text-[11px] font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
                            >
                              保存输入说明
                            </Button>
	                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
  );
}
