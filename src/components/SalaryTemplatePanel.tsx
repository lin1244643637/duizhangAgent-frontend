import { useEffect, useState } from 'react';
import { Button, Input, Upload } from 'antd';
import {
  deleteSalaryTemplate,
  draftSalaryTemplateFromExcel,
  listSalaryTemplates,
  saveSalaryTemplate,
} from '../api/kb';
import type { SalaryTemplateDraft, SalaryTemplateSummary } from '../types';
import { formatBeijingTime } from '../utils/time';
import { ConfirmDialog } from './ConfirmDialog';
import { FloatingNotice, type FloatingNoticeState } from './FloatingNotice';

function formatTime(iso: string): string {
  if (!iso) return '';
  return formatBeijingTime(iso, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(/\//g, '-');
}

/**
 * 工资表模板面板：上传任意工资表 Excel -> 大模型转成可复用模板 -> 入库。
 * 自包含状态，挂在知识库「人事」栏目下，尽量减少对共享页面的改动。
 */
export function SalaryTemplatePanel({ isAdmin }: { isAdmin: boolean }) {
  const [templates, setTemplates] = useState<SalaryTemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<FloatingNoticeState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => Promise<void> } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [draft, setDraft] = useState<SalaryTemplateDraft | null>(null);
  const [saving, setSaving] = useState(false);

  function showNotice(message: string, variant: FloatingNoticeState['variant'] = 'info') {
    setNotice({ message, variant });
  }

  async function refresh() {
    setLoading(true);
    try {
      setTemplates(await listSalaryTemplates());
    } catch (e) {
      showNotice((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  function pickFile(f: File | null) {
    setFile(f);
    setDraft(null);
    if (f && !name.trim()) {
      setName(f.name.replace(/\.(xlsx|xlsm)$/i, ''));
    }
  }

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    try {
      const d = await draftSalaryTemplateFromExcel(file, name);
      setDraft(d);
      setName(d.name);
      showNotice('工资表模板草稿已生成', 'success');
    } catch (e) {
      showNotice((e as Error).message, 'error');
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await saveSalaryTemplate({ name: name.trim() || draft.name, template: draft.template });
      showNotice(`工资表模板「${name.trim() || draft.name}」已入库`, 'success');
      setDraft(null);
      setFile(null);
      setName('');
      await refresh();
    } catch (e) {
      showNotice((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tpl: SalaryTemplateSummary) {
    setConfirmDialog({
      title: '删除工资表模板',
      message: `确认删除工资表模板「${tpl.name}」？`,
      onConfirm: async () => {
        await deleteSalaryTemplate(tpl.id);
        await refresh();
        showNotice('模板已删除', 'success');
      },
    });
  }

  async function handleConfirmDialog() {
    if (!confirmDialog) return;
    try {
      await confirmDialog.onConfirm();
    } catch (e) {
      showNotice((e as Error).message, 'error');
    } finally {
      setConfirmDialog(null);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">工资表模板</h3>
          <p className="mt-1 text-xs text-slate-500">
            上传任意工资表 Excel，由大模型识别表头/公式/合计生成可复用模板；后续按知识库与钉钉数据回填导出。
          </p>
        </div>
        <span className="text-[11px] text-slate-400">已存 {templates.length} 个</span>
      </div>

      {isAdmin && (
        <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
	            <Upload
	              accept=".xlsx,.xlsm"
	              showUploadList={false}
	              beforeUpload={(selectedFile) => {
	                pickFile(selectedFile);
	                return Upload.LIST_IGNORE;
	              }}
	            >
	              <Button autoInsertSpace={false} className="h-auto rounded-lg border-0 bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600">
	                选择工资表 Excel
	              </Button>
	            </Upload>
	            <Input
	              value={name}
	              onChange={(e) => setName(e.target.value)}
	              placeholder="模板名称（默认取文件名）"
	              className="flex-1 rounded-lg border border-violet-100 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-100"
	            />
	            <Button
	              autoInsertSpace={false}
	              onClick={handleParse}
	              disabled={!file || parsing}
	              loading={parsing}
	              className="h-auto rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
	            >
	              {parsing ? '解析中…' : '解析生成模板'}
	            </Button>
          </div>

          {draft && (
            <div className="mt-3 rounded-lg border border-violet-100 bg-white p-3">
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span>{draft.sheet_count} 张明细表</span>
                <span>录入列 {draft.input_count}</span>
                <span>公式列 {draft.formula_count}</span>
              </div>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">
                {draft.summary}
              </pre>
              <div className="mt-2 flex gap-2">
	                <Button
	                  autoInsertSpace={false}
	                  onClick={handleSave}
	                  loading={saving}
	                  className="h-auto rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
	                >
	                  {saving ? '保存中…' : '保存入库'}
	                </Button>
	                <Button
	                  autoInsertSpace={false}
	                  onClick={() => setDraft(null)}
	                  className="h-auto rounded-lg border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
	                >
	                  取消
	                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <p className="px-1 py-4 text-center text-xs text-slate-400">加载中…</p>
        ) : templates.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-slate-400">暂无工资表模板</p>
        ) : (
          templates.map((tpl) => (
            <div key={tpl.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{tpl.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                  <span>{tpl.sheet_count} 表 · 录入 {tpl.input_count} · 公式 {tpl.formula_count}</span>
                  {tpl.source_file && <span className="truncate max-w-[200px]">源：{tpl.source_file}</span>}
                  {tpl.updated_at && <span>{formatTime(tpl.updated_at)}</span>}
                </div>
              </div>
              {isAdmin && (
	                <Button
	                  autoInsertSpace={false}
	                  onClick={() => handleDelete(tpl)}
		                  className="ml-3 h-auto shrink-0 rounded-lg border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-red-50 hover:text-red-600"
	                >
	                  删除
	                </Button>
              )}
            </div>
          ))
        )}
      </div>
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel="删除"
          onConfirm={handleConfirmDialog}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {notice && <FloatingNotice notice={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
