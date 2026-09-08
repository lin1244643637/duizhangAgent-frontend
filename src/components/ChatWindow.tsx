import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, notification } from 'antd';
import type { AgentRunCommandResult } from '../api/agentRuns';
import { useChatStore } from '../store/chatStore';
import { useTaskStore } from '../store/taskStore';
import { useAuthStore } from '../store/authStore';
import { useAgentChat } from '../hooks/useAgentChat';
import type { TaskRecord } from '../types/task';
import { MessageBubble } from './MessageBubble';
import { ResponsePartsRenderer } from './ResponsePartsRenderer';
import { ToolCallCard } from './ToolCallCard';
import { FileUploadArea } from './FileUploadArea';
import { TaskCard } from './TaskCard';
import { QueryEvidencePanel } from './QueryEvidencePanel';
import { KnowledgeExtractDialog } from './KnowledgeExtractDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { Popup, SafeArea } from 'antd-mobile';

const LINE_HEIGHT = 24;
const MAX_ROWS = 4;
const CHAT_WINDOW_POLL_OWNER = 'chat-window';
const { TextArea } = Input;

function scrollMessageListToBottom(container: HTMLDivElement, behavior: ScrollBehavior) {
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top: container.scrollHeight, behavior });
    return;
  }
  container.scrollTop = container.scrollHeight;
}

export function ChatWindow() {
  const sessions = useChatStore((state) => state.sessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const resetToNewSession = useChatStore((state) => state.resetToNewSession);
  const loadingHistory = useChatStore((state) => state.loadingHistory);
  const startPolling = useTaskStore((state) => state.startPolling);
  const stopPolling = useTaskStore((state) => state.stopPolling);
  const tasks = useTaskStore((state) => state.tasks);
  const [dupConfirm, setDupConfirm] = useState<{
    period: string;
    existing_sources: Array<{ bill_platform: string | null; source: string; filename: string; row_count: number }>;
    onConfirm: () => void;
  } | null>(null);
  const [cancelResearch, setCancelResearch] = useState<TaskRecord | null>(null);
  const cancelResearchInFlightRef = useRef(false);
  const [cancellingResearchTaskId, setCancellingResearchTaskId] = useState<string | null>(null);

  const { sendMessage, resumeResearchRun, cancelResearchRun } = useAgentChat({
    onDuplicate: ({ period, existing_sources, onConfirm }) => setDupConfirm({ period, existing_sources, onConfirm }),
  });
  const role = useAuthStore((state) => state.role);
  const [input, setInput] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

  const session = useMemo(
    () => sessions.find((item) => item.id === activeSessionId),
    [activeSessionId, sessions],
  );
  const messages = session?.messages ?? [];
  const hiddenToolCallIds = useMemo(() => {
    const hidden = new Set<string>();
    let hasPublicActivity = false;
    for (const message of messages) {
      if (message.role === 'user') {
        hasPublicActivity = false;
      } else if (message.role === 'assistant') {
        hasPublicActivity = Boolean(message.activity);
      } else if (hasPublicActivity) {
        hidden.add(message.id);
      }
    }
    return hidden;
  }, [messages]);
  const historySessions = useMemo(() => sessions.filter((item) => !item.pending), [sessions]);
  const taskById = useMemo(() => {
    const index = new Map<string, (typeof tasks)[number]>();
    for (const task of tasks) {
      if (task.session_id === activeSessionId) index.set(task.task_id, task);
    }
    return index;
  }, [activeSessionId, tasks]);
  const previousQuestionByMessageId = useMemo(() => {
    const index = new Map<string, string>();
    let previousQuestion = '';
    for (const message of messages) {
      index.set(message.id, previousQuestion);
      if (message.role === 'user') previousQuestion = message.content;
    }
    return index;
  }, [messages]);
  const isEmptySession = messages.length === 0;
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    if (activeSessionId) {
      startPolling(CHAT_WINDOW_POLL_OWNER, {
        type: 'session',
        sessionId: activeSessionId,
      });
    } else {
      stopPolling(CHAT_WINDOW_POLL_OWNER);
    }
  }, [activeSessionId, startPolling, stopPolling]);

  useEffect(
    () => () => stopPolling(CHAT_WINDOW_POLL_OWNER),
    [stopPolling],
  );

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;
    scrollMessageListToBottom(container, 'smooth');
  }, [activeSessionId, messages.length]);

  useEffect(() => {
    if (!lastMessage?.streaming || !lastMessage.content) return;
    const frame = requestAnimationFrame(() => {
      const container = messageListRef.current;
      if (!container) return;
      scrollMessageListToBottom(container, 'auto');
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSessionId, lastMessage?.content, lastMessage?.id, lastMessage?.streaming]);

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed && pendingFiles.length === 0) return;
    setInput('');
    setShowUpload(false);
    setSending(true);
    const files = pendingFiles;
    setPendingFiles([]);
    try {
      const fileSet = files.length > 0 ? { files, taskType: 'file_parsing' as const } : undefined;
      await sendMessage(trimmed || '上传账单文件', fileSet);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  }

  async function confirmResearchCancel() {
    if (cancelResearchInFlightRef.current) return;
    const task = cancelResearch;
    if (!task) return;
    cancelResearchInFlightRef.current = true;
    setCancellingResearchTaskId(task.task_id);
    setCancelResearch(null);
    try {
      await cancelResearchRun(task);
      notification.success({ message: '经营研究已取消', duration: 5, closable: true });
    } catch (error) {
      notification.error({
        message: '取消经营研究失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        duration: 5,
        closable: true,
      });
    } finally {
      cancelResearchInFlightRef.current = false;
      setCancellingResearchTaskId(null);
    }
  }

  function renderComposer(variant: 'center' | 'dock') {
    const isCenter = variant === 'center';

    return (
      <div
        className={`mobile-soft-focus flex items-end gap-2 border transition-colors focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-200/70 ${
          isCenter
            ? 'min-h-[72px] rounded-[28px] border-slate-200 bg-white px-4 py-3 shadow-lg shadow-slate-200/70'
            : 'rounded-2xl border-slate-200 bg-white px-3 py-2 shadow-sm'
        }`}
      >
        <Button
          htmlType="button"
          onClick={() => setShowUpload((v) => !v)}
          title="上传账单文件"
          aria-label="上传账单文件"
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border-0 p-0 shadow-none transition-colors cursor-pointer ${
            showUpload ? 'text-blue-600 bg-blue-100' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
          } ${isCenter ? '' : 'mb-0.5'}`}
        >
          <svg className={isCenter ? 'w-5 h-5' : 'w-5 h-5'} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
          </svg>
        </Button>

        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isCenter ? '向对账 Agent 提问' : '输入消息'}
          autoSize={{ minRows: 1, maxRows: MAX_ROWS }}
          className={`flex-1 bg-transparent resize-none self-center border-0 text-slate-800 shadow-none placeholder-slate-400 focus:outline-none focus:ring-0 ${
            isCenter ? 'text-base py-1' : 'text-sm'
          }`}
          style={{ lineHeight: `${LINE_HEIGHT}px` }}
        />

        <Button
          htmlType="button"
          onClick={() => handleSend(input)}
          disabled={sending || (!input.trim() && pendingFiles.length === 0)}
          aria-label="发送消息"
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border-0 bg-blue-500 p-0 text-white shadow-none hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ${
            isCenter ? '' : 'mb-0.5 rounded-lg'
          }`}
        >
          {sending ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          )}
        </Button>
      </div>
    );
  }

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm">选择一个对话或新建对话</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 flex-col bg-slate-50 min-w-0">
      {/* 顶部标题栏 */}
      <div className="hidden px-5 py-3 border-b border-slate-200 md:flex items-center justify-between bg-white shadow-sm">
        <h2 className="text-sm font-medium text-slate-700">{session?.title ?? '对话'}</h2>
        {role === 'admin' && messages.length > 0 && !session?.pending && (
          <Button
            onClick={() => setShowExtract(true)}
            title="把本次对话中的稳定结论沉淀为知识"
            className="h-auto px-3 py-1 rounded-lg text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 cursor-pointer transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
            </svg>
            归档为知识
          </Button>
        )}
      </div>
      <div className="border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            autoInsertSpace={false}
            htmlType="button"
            className="h-10 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-none"
            onClick={() => setHistoryOpen(true)}
          >
            历史
          </Button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{session?.title ?? '对话'}</div>
          <Button
            autoInsertSpace={false}
            htmlType="button"
            className="h-10 shrink-0 rounded-xl bg-blue-600 px-3 text-xs font-medium text-white shadow-none"
            onClick={() => resetToNewSession()}
          >
            新对话
          </Button>
        </div>
      </div>

      {/* 消息列表 */}
      <div
        ref={messageListRef}
        role="log"
        aria-label="对话消息"
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 md:px-5 md:py-4"
      >
        {isEmptySession && (
          <div className="flex min-h-full items-center justify-center px-1 pb-20 md:px-4 md:pb-24">
            <div className="w-full max-w-3xl">
              <div className="mb-9 flex flex-col items-center text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-800 md:text-3xl">你好，我是对账 Agent</h1>
              </div>

              {showUpload && (
                <div className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <FileUploadArea
                    files={pendingFiles}
                    onFilesChange={setPendingFiles}
                    onClose={() => setShowUpload(false)}
                  />
                </div>
              )}

              {renderComposer('center')}
            </div>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.role === 'tool_call' && hiddenToolCallIds.has(msg.id)) return null;
          const task = msg.taskId ? taskById.get(msg.taskId) : undefined;
          return (
          <div key={msg.id}>
            {msg.role === 'tool_call' && msg.toolCall ? (
              <ToolCallCard toolCall={msg.toolCall} />
            ) : (
              <MessageBubble
                message={msg}
                sessionId={activeSessionId!}
                hideStructuredContent={Boolean(msg.agentResponse)}
                structuredContent={msg.role === 'assistant' && msg.agentResponse ? (
                  <ResponsePartsRenderer
                    response={msg.agentResponse}
                    onPrompt={async (message) => {
                      const sent = await sendMessage(message);
                      if (sent === false) throw new Error('follow-up prompt send failed');
                    }}
                    onAction={async (action) => {
                      const candidateId = action.params?.candidate_id;
                      const message = action.params?.message;
                      if (
                        action.kind !== 'clarify'
                        || typeof action.source_turn_id !== 'string'
                        || typeof candidateId !== 'string'
                        || typeof message !== 'string'
                      ) throw new Error('invalid clarification action');
                      const sent = await sendMessage(message, undefined, {
                        kind: 'clarification_choice',
                        source_turn_id: action.source_turn_id,
                        candidate_id: candidateId,
                      });
                      if (sent === false) throw new Error('clarification send failed');
                    }}
                    promptDisabled={sending || Boolean(lastMessage?.streaming)}
                  />
                ) : undefined}
              />
            )}
            {msg.role === 'assistant' && !msg.streaming && !msg.agentResponse && (
              <LegacyIntentClarificationButtons content={msg.content} onChoose={(value) => sendMessage(value)} />
            )}
            {task ? (
              <TaskCard
                task={task}
                onResearchResume={(researchTask, result) => resumeResearchRun(researchTask, result as AgentRunCommandResult)}
                researchCancelling={cancellingResearchTaskId === task.task_id}
                onResearchCancel={(researchTask) => {
                  if (!cancelResearchInFlightRef.current) setCancelResearch(researchTask);
                }}
              />
            ) : null}
            {(msg.evidence || msg.knowledgeSuggestion || msg.queryExport?.available || hasKnowledgeContext(msg.knowledgeContext)) && (
              <QueryEvidencePanel
                evidence={msg.evidence}
                knowledgeSuggestion={msg.knowledgeSuggestion}
                queryExport={msg.queryExport}
                knowledgeContext={msg.knowledgeContext}
                sessionId={activeSessionId!}
                question={previousQuestionByMessageId.get(msg.id) ?? ''}
                onRequery={(q) => sendMessage(q)}
                isAdmin={role === 'admin'}
              />
            )}
          </div>
          );
        })}
      </div>

      {/* 重复数据确认弹窗 */}
      {dupConfirm && (
        <ConfirmDialog
          title="检测到重复数据"
          message={
            <div className="space-y-1">
              <p>账期 <span className="font-mono font-medium">{dupConfirm.period}</span> 已有以下数据，是否替换？</p>
              <ul className="mt-2 space-y-1 text-sm">
                {dupConfirm.existing_sources.map((s, i) => {
                  const label = s.source === 'bank'
                    ? `银行流水${s.bill_platform ? `（${s.bill_platform}）` : s.filename ? `（${s.filename}）` : ''}`
                    : `平台账单${s.bill_platform ? `（${s.bill_platform}）` : s.filename ? `（${s.filename}）` : ''}`;
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      <span>{label}，共 <span className="font-medium">{s.row_count}</span> 条</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          }
          confirmLabel="确认替换"
          onConfirm={() => { dupConfirm.onConfirm(); setDupConfirm(null); }}
          onCancel={() => setDupConfirm(null)}
        />
      )}

      {cancelResearch && (
        <ConfirmDialog
          title="取消经营研究"
          message="确认取消这项经营研究吗？取消后将停止当前研究。"
          confirmLabel="确认取消"
          onConfirm={() => { void confirmResearchCancel(); }}
          onCancel={() => setCancelResearch(null)}
        />
      )}

      {/* 文件上传区 */}
      {showUpload && !isEmptySession && (
        <FileUploadArea
          files={pendingFiles}
          onFilesChange={setPendingFiles}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* 输入区 */}
      {!isEmptySession && (
        <div className="border-t border-slate-200 bg-white px-3 py-2 md:px-4 md:py-3">
          {renderComposer('dock')}
        </div>
      )}

      {showExtract && activeSessionId && (
        <KnowledgeExtractDialog
          sessionId={activeSessionId}
          onClose={() => setShowExtract(false)}
        />
      )}
      <Popup
        visible={historyOpen}
        position="bottom"
        closeOnSwipe
        onMaskClick={() => setHistoryOpen(false)}
        onClose={() => setHistoryOpen(false)}
        bodyClassName="rounded-t-2xl bg-white"
      >
        <div className="max-h-[82dvh] overflow-y-auto px-4 pb-4 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-800">历史对话</div>
            <Button autoInsertSpace={false} htmlType="button" className="h-9 border-0 px-2 text-xs text-slate-500 shadow-none" onClick={() => setHistoryOpen(false)}>关闭</Button>
          </div>
          <Button
            autoInsertSpace={false}
            htmlType="button"
            className="mb-3 h-10 w-full rounded-lg bg-blue-600 text-sm text-white shadow-none"
            onClick={() => {
              resetToNewSession();
              setHistoryOpen(false);
            }}
          >
            新建对话
          </Button>
          {loadingHistory ? (
            <div className="py-6 text-center text-sm text-slate-400">加载中…</div>
          ) : historySessions.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">暂无历史对话</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100">
              {historySessions.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`flex h-12 w-full min-w-0 items-center justify-between gap-3 border-b border-slate-100 px-3 text-left last:border-b-0 ${
                    item.id === activeSessionId ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-700'
                  }`}
                  onClick={() => {
                    setActiveSession(item.id);
                    setHistoryOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title || '未命名对话'}</span>
                  <span className="shrink-0 text-xs text-slate-400">{item.messages.length ? `${item.messages.length} 条` : '未加载'}</span>
                </button>
              ))}
            </div>
          )}
          <SafeArea position="bottom" />
        </div>
      </Popup>
    </div>
  );
}

type ClarificationOption = {
  value: string;
  title: string;
  detail: string;
  examples: string[];
};

// LegacyIntentClarificationButtons keeps historical text-only clarification messages interactive.
export function LegacyIntentClarificationButtons({ content, onChoose }: { content: string; onChoose: (value: string) => void }) {
  const options = clarificationOptions(content);
  if (options.length === 0) return null;
  return (
    <div className="ml-0 mt-2 flex flex-wrap gap-2 md:ml-9">
      {options.map((option) => (
        <Button
          key={option.value}
          htmlType="button"
          onClick={() => onChoose(option.value)}
          title={option.examples.length > 0 ? `例如：${option.examples.join(' / ')}` : option.detail}
          aria-label={`选择${option.title}`}
          className="group inline-flex h-auto max-w-full items-center gap-1.5 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <span className="truncate">{option.title}</span>
        </Button>
      ))}
    </div>
  );
}

export const IntentClarificationButtons = LegacyIntentClarificationButtons;

export function clarificationOptions(content: string): ClarificationOption[] {
  if (!content.includes('需要先确认你想查哪类数据')) return [];
  const options: ClarificationOption[] = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(\d+)\.\s*(.+?)\s*$/);
    if (!match) continue;
    const label = match[2].trim();
    const [rawTitle, ...detailParts] = label.split(/[：:]/);
    const examples: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && !/^\s*\d+\.\s*/.test(lines[cursor])) {
      const exampleMatch = lines[cursor].match(/^\s*例[：:]\s*(.+?)\s*$/);
      if (exampleMatch) {
        examples.push(...exampleMatch[1].split('/').map((item) => item.trim()).filter(Boolean));
      }
      cursor += 1;
    }
    options.push({
      value: match[1],
      title: rawTitle.trim() || label,
      detail: detailParts.join('：').trim(),
      examples,
    });
  }
  return options;
}

function hasKnowledgeContext(context?: { trace?: unknown[]; missing?: unknown[]; suggestions?: string[] } | null): boolean {
  return Boolean(
    (context?.trace?.length ?? 0)
    || (context?.missing?.length ?? 0)
    || context?.suggestions?.some((item) => item.trim()),
  );
}
