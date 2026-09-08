import { PASSWORD_LENGTH_HINT, describePasswordStrength } from './passwordPolicy';

const strengthColorClass = {
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
} as const;

export function PasswordStrengthHint({ password }: { password: string }) {
  const strength = describePasswordStrength(password);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-600">密码强度：{strength.label}</span>
        <span className="text-slate-400">{PASSWORD_LENGTH_HINT}</span>
      </div>
      <div aria-label={`密码强度 ${strength.label}`} className="flex gap-1">
        {[1, 2, 3, 4].map((index) => (
          <span
            className={`h-1 flex-1 rounded-full ${index <= strength.score ? strengthColorClass[strength.color] : 'bg-slate-200'}`}
            key={index}
          />
        ))}
      </div>
    </div>
  );
}
