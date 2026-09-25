import { useEffect, useId, useMemo, useState } from 'react';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DisconnectOutlined,
  DownOutlined,
  LoadingOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { AgentActivity } from '../types';

interface Props {
  activity: AgentActivity;
}

function formatElapsed(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)} 秒`;
}

function summaryText(activity: AgentActivity, currentLabel: string): string {
  const elapsed = activity.total_duration_ms ?? activity.elapsed_ms;
  const duration = elapsed > 0 ? ` · ${formatElapsed(elapsed)}` : '';
  if (activity.status === 'completed') {
    return `已完成 ${activity.steps.length} 项分析活动${duration}`;
  }
  if (activity.status !== 'running') return `${activity.label}${duration}`;
  return `${currentLabel}${duration}`;
}

function StatusIcon({ status }: Pick<AgentActivity, 'status'>) {
  if (status === 'completed') return <CheckCircleOutlined aria-hidden="true" className="text-emerald-600" />;
  if (status === 'partial' || status === 'empty' || status === 'needs_confirmation') return <CheckCircleOutlined aria-hidden="true" className="text-amber-600" />;
  if (status === 'failed') return <CloseCircleOutlined aria-hidden="true" className="text-red-600" />;
  if (status === 'unavailable') return <DisconnectOutlined aria-hidden="true" className="text-slate-600" />;
  if (status === 'cancelled') return <StopOutlined aria-hidden="true" className="text-amber-600" />;
  if (status === 'interrupted') return <DisconnectOutlined aria-hidden="true" className="text-slate-600" />;
  return <LoadingOutlined aria-hidden="true" className="text-blue-600 motion-reduce:animate-none" />;
}

export function AgentActivitySummary({ activity }: Props) {
  const detailsId = useId();
  const latestStep = activity.steps[activity.steps.length - 1];
  const currentStep = activity.status === 'running'
    ? activity.steps.find((step) => step.label === activity.label) ?? latestStep
    : latestStep;
  const currentLabel = currentStep?.label ?? activity.label;
  const summary = summaryText(activity, currentLabel);
  const [expanded, setExpanded] = useState(false);
  const announcement = useMemo(
    () => `${activity.status}:${currentStep?.step_id ?? ''}:${currentLabel}`,
    [activity.status, currentLabel, currentStep?.step_id],
  );

  useEffect(() => {
    if (activity.status !== 'running') setExpanded(false);
  }, [activity.status]);

  return (
    <section className={`w-full rounded-xl px-2 text-sm text-slate-600 transition-colors ${
      activity.status === 'running' ? 'bg-blue-50/70' : 'bg-transparent hover:bg-slate-100/70'
    }`}>
      <button
        type="button"
        className="flex min-h-10 w-full items-center gap-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((value) => !value)}
      >
        <StatusIcon status={activity.status} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{summary}</span>
        <DownOutlined aria-hidden="true" className={`text-slate-400 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
      {expanded && (
        <div id={detailsId} className="border-t border-slate-200/80 py-2.5">
          <ol className="space-y-2">
            {activity.steps.map((step) => (
              <li key={step.step_id} className="flex items-start gap-2 text-xs text-slate-600">
                <StatusIcon status={step.status} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-700">{step.label}</span>
                  {step.detail && <span className="mt-0.5 block text-slate-500">{step.detail}</span>}
                </span>
                {step.elapsed_ms > 0 && <span className="shrink-0 text-slate-500">{formatElapsed(step.elapsed_ms)}</span>}
              </li>
            ))}
          </ol>
          {(activity.scope.length > 0 || activity.sources.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2 text-xs text-slate-600">
              {activity.scope.map((label) => <span key={`scope:${label}`} className="rounded border border-slate-200 bg-white px-1.5 py-0.5">{label}</span>)}
              {activity.sources.map((label) => <span key={`source:${label}`} className="rounded border border-slate-200 bg-white px-1.5 py-0.5">{label}</span>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
