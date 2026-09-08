import { useState, type ReactNode } from 'react';
import { Button } from 'antd';

type CollapsiblePanelProps = {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  onExpand?: () => void;
  className?: string;
};

export function CollapsiblePanel({
  title,
  summary = '',
  children,
  defaultCollapsed = false,
  onExpand,
  className = '',
}: CollapsiblePanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

	  return (
	    <div className={`rounded-xl border border-slate-100 bg-white ${className}`}>
	      <Button
	        autoInsertSpace={false}
	        type="text"
	        htmlType="button"
	        onClick={() => {
	          if (collapsed) onExpand?.();
	          setCollapsed((value) => !value);
	        }}
	        className="flex h-auto min-h-11 w-full items-center justify-between gap-3 rounded-none px-4 py-3 text-left shadow-none transition-colors hover:bg-slate-50"
	        aria-expanded={!collapsed}
	      >
	        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{title}</p>
          {summary && <p className="mt-0.5 truncate text-xs text-slate-400">{summary}</p>}
        </div>
	        <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
	          {collapsed ? '展开' : '收起'} {collapsed ? '⌄' : '⌃'}
	        </span>
	      </Button>
	      {!collapsed && <div className="border-t border-slate-100">{children}</div>}
	    </div>
  );
}
