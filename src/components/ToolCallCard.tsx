import type { ToolCallData } from '../types';

interface Props {
  toolCall: ToolCallData;
}

export function ToolCallCard({ toolCall }: Props) {
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[75%] bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm ml-9 shadow-sm">
        <div className="flex items-center gap-2">
          {toolCall.status === 'loading' && (
            <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {toolCall.status === 'completed' && (
            <svg className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          {toolCall.status === 'failed' && (
            <svg className="h-4 w-4 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
          <span className="font-medium text-slate-700">{toolCall.name}</span>
        </div>
        {toolCall.description && (
          <p className="mt-1 text-slate-400 text-xs">{toolCall.description}</p>
        )}
      </div>
    </div>
  );
}
