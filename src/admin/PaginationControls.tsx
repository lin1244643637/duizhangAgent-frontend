import { Button } from 'antd';

export function PaginationControls({
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page + 1, totalPages);
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>
        {total === 0 ? '暂无数据' : `第 ${from}-${to} 条，共 ${total} 条`}
      </span>
      <div className="flex items-center gap-2">
        <Button
          htmlType="button"
          disabled={loading || page <= 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
          className="h-auto rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          上一页
        </Button>
        <span className="min-w-16 text-center">
          {current} / {totalPages}
        </span>
        <Button
          htmlType="button"
          disabled={loading || current >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-auto rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
