import { Tooltip } from 'antd';
import type { TrendMovingAverageMeta } from './trendPeriod';

export function MovingAverageStatus({ items }: { items: TrendMovingAverageMeta[] }) {
  const unavailable = items.filter(item => !item.available);
  if (!unavailable.length) return null;

  return (
    <div className="flex flex-wrap gap-1 text-[11px] text-slate-400">
      {unavailable.map(item => (
        <Tooltip
          key={item.field}
          title={`数据不足（已有 ${item.available_periods} 期，需要 ${item.window} 期）`}
        >
          <span className="cursor-help">{item.label} 数据不足</span>
        </Tooltip>
      ))}
    </div>
  );
}
