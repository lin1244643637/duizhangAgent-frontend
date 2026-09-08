import { Input } from 'antd';
import { useId } from 'react';

type DateInputProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: 'date' | 'month' | 'time';
  helper?: string;
};

export function DateInput({
  label,
  value,
  onChange,
  disabled = false,
  type = 'date',
  helper = '',
}: DateInputProps) {
  const inputId = useId();

  return (
    <div className="block">
      {label && <label htmlFor={inputId} className="text-xs font-medium text-slate-500">{label}</label>}
      <div className={`mt-1 flex h-11 items-center rounded-xl border border-slate-200 px-3 shadow-sm transition focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100 ${disabled ? 'bg-slate-50' : 'bg-white'}`}>
        <Input
          id={inputId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-slate-800 shadow-none outline-none disabled:text-slate-400"
        />
      </div>
      {helper && <p className="mt-1 text-[11px] leading-4 text-slate-400">{helper}</p>}
    </div>
  );
}
