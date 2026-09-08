import { Select } from 'antd';
import type { DetailPeriodOption } from './trendPeriod';

export function DetailPeriodSelect({
  options,
  value,
  onChange,
  label = '数据周期',
  ariaLabel = '数据周期',
}: {
  options: DetailPeriodOption[];
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <Select
        aria-label={ariaLabel}
        className="min-w-0 flex-1 sm:w-[220px] sm:flex-none"
        value={value}
        onChange={onChange}
        options={[...options].reverse().map(option => ({
          value: option.key,
          label: option.label,
        }))}
        disabled={options.length === 0}
        placeholder="暂无可选周期"
        popupMatchSelectWidth={false}
      />
    </div>
  );
}
