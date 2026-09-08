import { Select } from 'antd';
import type { ComparisonMode, MetricComparison } from '../../features/operations-analysis/api/client';

export type ComparisonValueFormat = 'money' | 'integer' | 'decimal' | 'hours' | 'moneyPerHour' | 'percentagePoint';
export type ComparisonDisplayMode = 'percentage' | 'difference' | 'previous' | 'all';
export type ComparisonDisplayTone = 'positive' | 'negative' | 'neutral';
export type ComparisonDisplayItem = {
  key: Exclude<ComparisonDisplayMode, 'all'>;
  label: string;
  value: string;
  tone: ComparisonDisplayTone;
};

function signedNumber(value: number, digits: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatDifference(value: number, format: ComparisonValueFormat): string {
  if (format === 'money') return `${value > 0 ? '+' : value < 0 ? '-' : ''}¥${Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === 'moneyPerHour') return `${value > 0 ? '+' : value < 0 ? '-' : ''}¥${Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/时`;
  if (format === 'integer') return signedNumber(value, 0);
  if (format === 'hours') return `${signedNumber(value, 1)} 小时`;
  if (format === 'percentagePoint') return `${signedNumber(value * 100, 1)} 个百分点`;
  return signedNumber(value, 1);
}

function formatPrevious(value: number, format: ComparisonValueFormat): string {
  if (format === 'money') return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === 'moneyPerHour') return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/时`;
  if (format === 'integer') return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  if (format === 'hours') return `${value.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} 小时`;
  if (format === 'percentagePoint') return `${(value * 100).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function comparisonTone(comparison?: MetricComparison | null): ComparisonDisplayTone {
  const direction = Math.sign(Number(comparison?.difference ?? 0));
  if (direction > 0) return 'positive';
  if (direction < 0) return 'negative';
  return 'neutral';
}

export function comparisonDisplayItems(
  comparison: MetricComparison | null | undefined,
  displayMode: ComparisonDisplayMode,
  format: ComparisonValueFormat = 'money',
): ComparisonDisplayItem[] {
  const tone = comparisonTone(comparison);
  const previousValue = comparison?.previous == null ? '不可比' : formatPrevious(comparison.previous, format);
  const differenceValue = comparison?.difference == null ? '不可比' : formatDifference(comparison.difference, format);
  const percentageValue = comparison?.status === 'zero_previous'
    ? '上期数据不全，比例不可比'
    : comparison?.change_rate == null
      ? '不可比'
      : `${signedNumber(comparison.change_rate * 100, 1)}%`;
  const items: Record<Exclude<ComparisonDisplayMode, 'all'>, ComparisonDisplayItem> = {
    previous: { key: 'previous', label: '上期数据', value: previousValue, tone },
    difference: { key: 'difference', label: '较上期差值', value: differenceValue, tone },
    percentage: {
      key: 'percentage',
      label: '较上期比例',
      value: percentageValue,
      tone: percentageValue.includes('不可比') ? 'neutral' : tone,
    },
  };
  return displayMode === 'all'
    ? [items.previous, items.difference, items.percentage]
    : [items[displayMode]];
}

function comparisonText(
  comparison: MetricComparison,
  displayMode: ComparisonDisplayMode,
  format: ComparisonValueFormat,
  prefix: boolean,
): string {
  const items = comparisonDisplayItems(comparison, displayMode, format);
  if (displayMode === 'all') {
    return `上期 ${items[0].value} · 差值 ${items[1].value} · 比例 ${items[2].value}`;
  }
  const item = items[0];
  if (displayMode === 'previous') return `上期 ${item.value}`;
  if (item.value.startsWith('上期数据不全')) return item.value;
  return `${prefix ? '较上期 ' : ''}${item.value}`;
}

function toneClass(comparison: MetricComparison): string {
  const tone = comparisonTone(comparison);
  return tone === 'positive'
    ? 'text-emerald-600'
    : tone === 'negative'
      ? 'text-red-500'
      : 'text-slate-500';
}

export function PeriodComparisonText({
  comparison,
  format = 'money',
  prefix = true,
  displayMode,
  className = '',
}: {
  comparison?: MetricComparison | null;
  format?: ComparisonValueFormat;
  prefix?: boolean;
  displayMode?: ComparisonDisplayMode;
  className?: string;
}) {
  if (!comparison) return null;
  if (displayMode) {
    const text = comparisonText(comparison, displayMode, format, prefix);
    const neutral = text.includes('不可比');
    return <span className={`${neutral ? 'text-slate-400' : toneClass(comparison)} ${className}`}>{text}</span>;
  }
  const label = prefix ? '较上期 ' : '';
  if (comparison.status === 'zero_previous') {
    return (
      <span className={`text-slate-400 ${className}`}>
        上期数据不全，比例不可比
      </span>
    );
  }
  if (comparison.difference == null) {
    return <span className={`text-slate-400 ${className}`}>{label}不可比</span>;
  }
  const direction = Math.sign(comparison.difference);
  const tone = direction > 0
      ? 'text-emerald-600'
      : direction < 0
        ? 'text-red-500'
        : 'text-slate-500';
  const rate = comparison.change_rate == null
    ? '比例不可比'
    : `${signedNumber(comparison.change_rate * 100, 1)}%`;
  return (
    <span className={`${tone} ${className}`}>
      {label}{formatDifference(comparison.difference, format)} · {rate}
    </span>
  );
}

export function PeriodComparisonRate({
  comparison,
  displayMode = 'percentage',
  format = 'decimal',
  className = '',
}: {
  comparison?: MetricComparison | null;
  displayMode?: ComparisonDisplayMode;
  format?: ComparisonValueFormat;
  className?: string;
}) {
  if (!comparison) return null;
  const text = comparisonText(comparison, displayMode, format, false);
  return <span className={`${text.includes('不可比') ? 'text-slate-400' : toneClass(comparison)} ${className}`}>{text}</span>;
}

export function ComparisonModeSelect({
  value,
  onChange,
  ariaLabel,
  mobile = false,
}: {
  value: ComparisonMode;
  onChange: (value: ComparisonMode) => void;
  ariaLabel: string;
  mobile?: boolean;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className={mobile ? 'w-full' : 'w-[126px] shrink-0'}
      value={value}
      onChange={onChange}
      options={[
        { value: 'previous', label: '与上期对比' },
        { value: 'none', label: '不对比' },
      ]}
      popupMatchSelectWidth={false}
    />
  );
}

export function ComparisonDisplaySelect({
  value,
  onChange,
  ariaLabel,
  mobile = false,
  disabled = false,
}: {
  value: ComparisonDisplayMode;
  onChange: (value: ComparisonDisplayMode) => void;
  ariaLabel: string;
  mobile?: boolean;
  disabled?: boolean;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className={mobile ? 'w-full' : 'w-[118px] shrink-0'}
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={[
        { value: 'percentage', label: '百分比' },
        { value: 'difference', label: '差值' },
        { value: 'previous', label: '上期数据' },
        { value: 'all', label: '全部' },
      ]}
      popupMatchSelectWidth={false}
    />
  );
}

export function PeriodMetricCard({
  label,
  value,
  comparison,
  format = 'money',
  displayMode,
}: {
  label: string;
  value: string;
  comparison?: MetricComparison | null;
  format?: ComparisonValueFormat;
  displayMode?: ComparisonDisplayMode;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</div>
      {comparison ? (
        <PeriodComparisonText
          comparison={comparison}
          format={format}
          displayMode={displayMode}
          className="mt-1 block text-[11px] tabular-nums"
        />
      ) : null}
    </div>
  );
}

export function ComparisonPeriodNote({
  previousPeriod,
}: {
  previousPeriod?: { date_from: string; date_to: string } | null;
}) {
  if (!previousPeriod) return null;
  return (
    <div className="mt-2 text-[11px] tabular-nums text-slate-400">
      对比上期：{previousPeriod.date_from} 至 {previousPeriod.date_to}
    </div>
  );
}
