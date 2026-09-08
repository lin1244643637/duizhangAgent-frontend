/** 上传对账模板弹窗：JSON 直传 / Excel 由 Agent 生成草稿（从 KnowledgeBasePage 机械拆出，行为不变）。 */

import type { Dispatch, SetStateAction } from 'react';
import { Alert, Button, Input, Modal, Upload } from 'antd';

type Props = {
  templateError: string | null;
  templateMessage: string | null;
  templateProvider: string;
  setTemplateProvider: Dispatch<SetStateAction<string>>;
  templateJson: string;
  setTemplateJson: Dispatch<SetStateAction<string>>;
  templateRules: string;
  setTemplateRules: Dispatch<SetStateAction<string>>;
  templateExcelFile: File | null;
  templateDrafting: boolean;
  templateSaving: boolean;
  setTemplateOpen: Dispatch<SetStateAction<boolean>>;
  setTemplateError: Dispatch<SetStateAction<string | null>>;
  handleJsonTemplateFile: (file: File | null) => void;
  handleExcelTemplateFile: (file: File | null) => void;
  handleGenerateTemplate: () => void;
  handleSaveTemplate: () => void;
  previewTemplate: () => { platformName: string; keywords: string[]; sheetCount: number; fieldCount: number };
};

export function ReconcileTemplateDialog({
  templateError,
  templateMessage,
  templateProvider,
  setTemplateProvider,
  templateJson,
  setTemplateJson,
  templateRules,
  setTemplateRules,
  templateExcelFile,
  templateDrafting,
  templateSaving,
  setTemplateOpen,
  setTemplateError,
  handleJsonTemplateFile,
  handleExcelTemplateFile,
  handleGenerateTemplate,
  handleSaveTemplate,
  previewTemplate,
}: Props) {
  const closeAndClearError = () => {
    setTemplateOpen(false);
    setTemplateError(null);
  };

  return (
    <Modal
      open
      centered
      title={<span className="text-base font-semibold text-slate-800">上传对账模板</span>}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            autoInsertSpace={false}
            onClick={() => setTemplateOpen(false)}
            className="h-auto rounded-xl px-4 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100"
          >
            取消
          </Button>
          <Button
            autoInsertSpace={false}
            onClick={handleSaveTemplate}
            disabled={templateDrafting}
            loading={templateSaving}
            className="h-auto rounded-xl bg-emerald-500 px-4 py-1.5 text-sm text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
          >
            {templateSaving ? '保存中…' : '保存模板'}
          </Button>
        </div>
      }
      closeIcon={<span className="text-xl leading-none text-slate-400 hover:text-slate-600">&times;</span>}
      getContainer={false}
      mask={{ closable: false }}
      onCancel={closeAndClearError}
      width={720}
      zIndex={1000}
      styles={{ container: { padding: 20, borderRadius: 16 }, header: { marginBottom: 16 }, body: { padding: 0 }, footer: { marginTop: 20 } }}
      style={{ maxWidth: '94vw' }}
    >
      <div className="max-h-[calc(90vh-112px)] overflow-y-auto">
        <div className="space-y-3">
          {templateError && (
            <Alert showIcon={false} type="error" title={templateError} className="rounded-xl border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600" />
          )}
          {templateMessage && !templateError && (
            <Alert showIcon={false} type="success" title={templateMessage} className="rounded-xl border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700" />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">JSON 模板文件</label>
	              <Upload
	                accept="application/json,.json"
	                showUploadList={false}
	                beforeUpload={(file) => {
	                  handleJsonTemplateFile(file);
	                  return Upload.LIST_IGNORE;
	                }}
	              >
	                <Button autoInsertSpace={false} className="h-auto rounded-lg border-0 bg-slate-100 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200">选择 JSON 文件</Button>
	              </Upload>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Excel 样例文件</label>
	              <Upload
	                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	                showUploadList={false}
	                disabled={templateDrafting}
	                beforeUpload={(file) => {
	                  handleExcelTemplateFile(file);
	                  return Upload.LIST_IGNORE;
	                }}
	              >
	                <Button autoInsertSpace={false} disabled={templateDrafting} className="h-auto rounded-lg border-0 bg-slate-100 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 disabled:opacity-50">选择 Excel 文件</Button>
	              </Upload>
              {templateExcelFile && (
                <p className="mt-1 text-xs text-slate-500 truncate">{templateExcelFile.name}</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">规则说明（可选，帮助 Agent 生成更准确的计算规则）</label>
            <Input.TextArea
              value={templateRules}
              onChange={(e) => setTemplateRules(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-xl border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder={"例如：\n应收 = 商品金额 + 打包费\n订单数只统计订单类型为「外卖订单」的行\n折扣率 = (应收 - 实收) / 应收"}
            />
          </div>
          {templateExcelFile && (
            <div className="flex items-center gap-2">
              <Button
                autoInsertSpace={false}
                type="primary"
                onClick={handleGenerateTemplate}
                loading={templateDrafting}
                className="h-auto rounded-xl bg-blue-500 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
              >
                {templateDrafting ? '生成中…' : '生成模板'}
              </Button>
              {templateDrafting && (
                <span className="text-xs text-blue-600">正在由 Agent 分析 Excel 表头并生成模板草稿…</span>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-600 mb-1">provider</label>
            <Input
              value={templateProvider}
              onChange={(e) => setTemplateProvider(e.target.value)}
              placeholder="例如 meituan_waimai"
              className="w-full rounded-xl border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">模板 JSON</label>
            <Input.TextArea
              value={templateJson}
              onChange={(e) => setTemplateJson(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-xl border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder='{"platform_name":"美团外卖","file_keywords":["美团外卖"],"sheets":[{"columns":{"date":"日期","net_amount":"实收金额"}}]}'
            />
          </div>

          {templateJson.trim() && (() => {
            try {
              const p = previewTemplate();
              return (
                <Alert
                  showIcon={false}
                  type="success"
                  title={`预览：${p.platformName} · ${p.keywords.join('、') || '无关键词'} · ${p.sheetCount} sheet · ${p.fieldCount} 字段`}
                  className="rounded-xl border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
                />
              );
            } catch {
              return <Alert showIcon={false} type="error" title="JSON 格式无效" className="rounded-xl border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600" />;
            }
          })()}
        </div>
      </div>
    </Modal>
  );
}
