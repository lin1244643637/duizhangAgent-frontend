import { useEffect, type ReactNode } from 'react';
import { Alert } from 'antd';

export type NoticeVariant = 'success' | 'error' | 'warning' | 'info';

export interface FloatingNoticeState {
  message: ReactNode;
  variant: NoticeVariant;
}

interface FloatingNoticeProps {
  notice: FloatingNoticeState;
  onClose: () => void;
  durationMs?: number;
  closeLabel?: ReactNode;
}

const NOTICE_STYLES: Record<NoticeVariant, { border: string; dot: string; text: string; close: string }> = {
  success: { border: 'border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-800', close: 'hover:bg-slate-100 hover:text-slate-600' },
  error: { border: 'border-red-200', dot: 'bg-red-500', text: 'text-red-800', close: 'hover:bg-slate-100 hover:text-slate-600' },
  warning: { border: 'border-amber-200', dot: 'bg-amber-500', text: 'text-amber-800', close: 'hover:bg-slate-100 hover:text-slate-600' },
  info: { border: 'border-blue-200', dot: 'bg-blue-500', text: 'text-blue-800', close: 'hover:bg-slate-100 hover:text-slate-600' },
};

export function FloatingNotice({ notice, onClose, durationMs = 5000, closeLabel = '×' }: FloatingNoticeProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, notice, onClose]);

  const style = NOTICE_STYLES[notice.variant];
  return (
    <Alert
      type={notice.variant}
      showIcon
      closable={{
        'aria-label': '关闭提示',
        closeIcon: (
          <span className={`ml-1 rounded px-1.5 text-slate-400 transition ${style.close}`}>
            {closeLabel}
          </span>
        ),
        onClose,
      }}
      icon={<span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />}
      title={<div className={`min-w-0 whitespace-pre-line text-sm leading-6 ${style.text}`}>{notice.message}</div>}
      className={`fixed right-5 top-5 z-[70] flex max-w-md items-start gap-3 rounded-lg border ${style.border} bg-white px-4 py-3 shadow-xl`}
      styles={{
        root: { background: '#fff' },
        icon: { marginInlineEnd: 0 },
        section: { minWidth: 0, flex: 1 },
        close: { marginInlineStart: 0 },
      }}
    />
  );
}
