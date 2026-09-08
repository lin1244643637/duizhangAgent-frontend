// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Message, Session } from '../types';
import { useChatStore } from './chatStore';

describe('chatStore streaming updates', () => {
  afterEach(() => vi.restoreAllMocks());

  it('updates one message without mapping every session and message', () => {
    const targetMessages: Message[] = [
      { id: 'assistant-1', role: 'assistant', content: '甲', createdAt: 1, streaming: true },
      { id: 'assistant-2', role: 'assistant', content: '不变', createdAt: 2 },
    ];
    const sessions: Session[] = [
      { id: 'session-1', title: '目标', messages: targetMessages, createdAt: 1 },
      { id: 'session-2', title: '其他', messages: [], createdAt: 2 },
    ];
    const sessionsMap = vi.spyOn(sessions, 'map');
    const messagesMap = vi.spyOn(targetMessages, 'map');
    useChatStore.setState({ sessions, activeSessionId: 'session-1' });

    useChatStore.getState().appendAssistantChunk('session-1', 'assistant-1', '乙丙');

    expect(sessionsMap).not.toHaveBeenCalled();
    expect(messagesMap).not.toHaveBeenCalled();
    expect(useChatStore.getState().sessions[0].messages[0].content).toBe('甲乙丙');
    expect(useChatStore.getState().sessions[0].messages[1]).toBe(targetMessages[1]);
    expect(useChatStore.getState().sessions[1]).toBe(sessions[1]);
  });
});
