import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from 'antd';
import { Popup, SafeArea } from 'antd-mobile';

export function MobileFilterPopup({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        autoInsertSpace={false}
        htmlType="button"
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-700 shadow-none"
        onClick={() => setOpen(true)}
      >
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate">{summary}</span>
          <span className="shrink-0 text-xs font-normal text-blue-600">筛选</span>
        </span>
      </Button>
      <Popup
        visible={open}
        position="bottom"
        closeOnSwipe
        onMaskClick={() => setOpen(false)}
        onClose={() => setOpen(false)}
        bodyClassName="rounded-t-2xl bg-white"
      >
        <div className="max-h-[82dvh] overflow-y-auto px-4 pb-4 pt-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0 text-sm font-semibold text-slate-800">{title}</div>
            <Button
              autoInsertSpace={false}
              htmlType="button"
              className="h-8 rounded-lg border-0 px-2 text-xs text-slate-500 shadow-none"
              onClick={() => setOpen(false)}
            >
              关闭
            </Button>
          </div>
          <div className="space-y-3">{children}</div>
          <SafeArea position="bottom" />
        </div>
      </Popup>
    </>
  );
}
