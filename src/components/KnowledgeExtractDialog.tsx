import { useEffect, useState } from 'react';
import { Button, Checkbox, Modal } from 'antd';
import { createKbEntry, extractFromSession } from '../api/kb';
import type { ExtractedFact } from '../types';

interface Props {
  sessionId: string;
  onClose: () => void;
}

export function KnowledgeExtractDialog({ sessionId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [facts, setFacts] = useState<ExtractedFact[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ ok: number; fail: number } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    extractFromSession(sessionId)
      .then((rows) => {
        if (!alive) return;
        setFacts(rows);
        setSelected(new Set(rows.map((_, i) => i)));
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [sessionId]);

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) return;
    setSubmitting(true);
    let ok = 0;
    let fail = 0;
    for (const idx of selected) {
      const f = facts[idx];
      try {
        await createKbEntry({
          title: f.title,
          content: f.content,
          category: f.category || 'general',
          source: 'extracted',
          source_session_id: sessionId,
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setDone({ ok, fail });
    setSubmitting(false);
  }

  return (
    <Modal
      open
      centered
      title={<span className="text-base font-semibold text-slate-800">归档为知识</span>}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            autoInsertSpace={false}
            onClick={onClose}
            className="h-auto rounded-xl px-4 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100"
          >
            {done ? '完成' : '取消'}
          </Button>
          {!done && facts.length > 0 && (
            <Button
              autoInsertSpace={false}
              type="primary"
              onClick={handleSubmit}
              disabled={submitting || selected.size === 0}
              loading={submitting}
              className="h-auto rounded-xl bg-blue-500 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
            >
              {submitting ? '写入中…' : `写入 ${selected.size} 条`}
            </Button>
          )}
        </div>
      }
      closeIcon={<span className="text-xl leading-none text-slate-400 hover:text-slate-600">&times;</span>}
      getContainer={false}
      mask={{ closable: false }}
      onCancel={onClose}
      width={640}
      zIndex={1000}
      styles={{
        container: { padding: 0, borderRadius: 16, overflow: 'hidden' },
        header: { marginBottom: 0, padding: '12px 20px', borderBottom: '1px solid #e2e8f0' },
        body: { padding: 0 },
        footer: { marginTop: 0, padding: '12px 20px', borderTop: '1px solid #e2e8f0' },
      }}
      style={{ maxWidth: '92vw' }}
    >
      <div className="max-h-[calc(85vh-106px)] overflow-y-auto px-5 py-4">
        {loading && <p className="text-center text-slate-400 text-sm">正在从会话中抽取候选事实…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && facts.length === 0 && (
          <p className="text-center text-slate-400 text-sm">这段对话暂无可沉淀的稳定事实。</p>
        )}

        {!loading && facts.length > 0 && (
          <div className="space-y-2">
            {facts.map((f, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => toggle(i)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggle(i);
                  }
                }}
                className="flex items-start gap-3 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(i)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => toggle(i)}
                  className="mt-1 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{f.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100">
                      {f.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap break-words">{f.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {done && (
          <p className="text-sm text-slate-700 mt-3">
            已写入 {done.ok} 条{done.fail > 0 ? `，失败 ${done.fail} 条` : ''}。
          </p>
        )}
      </div>
    </Modal>
  );
}
