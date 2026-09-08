import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select } from 'antd';
import type { KbEntry } from '../types';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'general', label: '通用' },
  { value: 'reconcile', label: '对账' },
  { value: 'perf', label: '绩效' },
  { value: 'product', label: '产品' },
  { value: 'sop', label: 'SOP' },
  { value: 'process', label: '流程' },
  { value: 'report', label: '报表' },
  { value: 'finance_process', label: '财务流程' },
  { value: 'finance_scope', label: '财务范围' },
  { value: 'finance_mapping', label: '回款映射' },
];

interface Props {
  entry: KbEntry | null;
  onClose: () => void;
  onSave: (body: { title: string; content: string; category: string }) => Promise<void>;
  categories?: { value: string; label: string }[];
  defaultCategory?: string;
}

export function KnowledgeEntryEditor({ entry, onClose, onSave, categories = CATEGORIES, defaultCategory = 'general' }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(entry?.title ?? '');
    setContent(entry?.content ?? '');
    setCategory(entry?.category ?? defaultCategory);
    setError(null);
  }, [entry, defaultCategory]);

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      setError('标题与内容不能为空');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ title: title.trim(), content: content.trim(), category });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      centered
      title={<span className="text-base font-semibold text-slate-800">{entry ? '编辑知识条目' : '新增知识条目'}</span>}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            autoInsertSpace={false}
            onClick={onClose}
            className="h-auto rounded-xl px-4 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100"
          >
            取消
          </Button>
          <Button
            autoInsertSpace={false}
            type="primary"
            onClick={handleSave}
            loading={saving}
            className="h-auto rounded-xl bg-blue-500 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
          >
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      }
      closeIcon={<span className="text-xl leading-none text-slate-400 hover:text-slate-600">&times;</span>}
      getContainer={false}
      mask={{ closable: false }}
      onCancel={onClose}
      width={560}
      zIndex={1000}
      styles={{ container: { padding: 20, borderRadius: 16 }, header: { marginBottom: 16 }, body: { padding: 0 }, footer: { marginTop: 20 } }}
      style={{ maxWidth: '92vw' }}
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">标题</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="w-full rounded-xl border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            placeholder="一句话概括，例如：门店退款政策"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-600 mb-1">分类</label>
          <Select
            value={category}
            onChange={setCategory}
            options={categories}
            className="w-full rounded-xl border-slate-200 bg-slate-50 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-600 mb-1">内容</label>
          <Input.TextArea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-xl border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            placeholder="自包含的事实表述，脱离原对话也能读懂"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  );
}
