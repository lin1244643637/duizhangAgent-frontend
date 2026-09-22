import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTypewriter } from './useTypewriter';

describe('display-only typewriter', () => {
  let time: number;
  let nextFrame: number;
  let frames: Map<number, FrameRequestCallback>;
  let motion: EventTarget & { matches: boolean };
  const advance = (duration = 32) => act(() => {
    time += duration;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(time));
  });
  const start = (text = '', streaming = true, enabled = true) => renderHook(
    (props) => useTypewriter(props.text, props.enabled, props.streaming),
    { initialProps: { text, streaming, enabled } },
  );

  beforeEach(() => {
    time = 0;
    nextFrame = 0;
    frames = new Map();
    motion = Object.assign(new EventTarget(), { matches: false });
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    vi.stubGlobal('matchMedia', vi.fn(() => motion));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('receives full text immediately but displays small batches and catches up', () => {
    const source = '真实流式接收与前端轻量打字机。'.repeat(20);
    const { result, rerender } = start();
    rerender({ text: source, streaming: true, enabled: true });
    expect(result.current.text).toBe('');
    expect(result.current.isTyping).toBe(true);
    advance();
    expect(result.current.text.length).toBeGreaterThan(0);
    expect(result.current.text.length).toBeLessThan(source.length);
    const prefix = result.current.text;
    rerender({ text: source + '新片段', streaming: true, enabled: true });
    expect(result.current.text).toBe(prefix);
    for (let i = 0; i < 60; i++) advance();
    expect(result.current.text).toBe(source + '新片段');
    expect(frames.size).toBe(0);
  });

  it('does not turn network latency into a first-frame jump', () => {
    const { result, rerender } = start();
    time = 10_000;
    const text = '收到内容以后开始显示'.repeat(30);
    rerender({ text, streaming: true, enabled: true });
    advance();
    expect(result.current.text.length).toBeGreaterThan(0);
    expect(result.current.text.length).toBeLessThan(text.length);
  });

  it('finishes playback within 600 ms of run completion without changing streaming', () => {
    const { result, rerender } = start();
    const text = '很长的回答'.repeat(1000);
    rerender({ text, streaming: true, enabled: true });
    advance();
    rerender({ text, streaming: false, enabled: true });
    expect(result.current.isTyping).toBe(true);
    advance(600);
    expect(result.current.text).toBe(text);
    expect(result.current.isTyping).toBe(false);
    expect(frames.size).toBe(0);
  });

  it('flushes when interrupted or disabled and resumes only with new text', () => {
    const { result, rerender } = start();
    rerender({ text: '断线前已经收到的内容', streaming: true, enabled: true });
    rerender({ text: '断线前已经收到的内容', streaming: false, enabled: false });
    expect(result.current.text).toBe('断线前已经收到的内容');
    expect(result.current.isTyping).toBe(false);
    expect(frames.size).toBe(0);
    rerender({ text: '断线前已经收到的内容', streaming: true, enabled: true });
    expect(result.current.text).toBe('断线前已经收到的内容');
    rerender({ text: '断线前已经收到的内容，重连新增', streaming: true, enabled: true });
    expect(result.current.text).toBe('断线前已经收到的内容');
    advance(1000);
    expect(result.current.text).toBe('断线前已经收到的内容，重连新增');
  });

  it('never replays history or already received content on mount', () => {
    const history = start('历史完整回答', false);
    expect(history.result.current.text).toBe('历史完整回答');
    history.rerender({ text: '更新后的历史完整回答', streaming: false, enabled: true });
    expect(history.result.current.text).toBe('更新后的历史完整回答');
    expect(start('切回正在流式的会话').result.current.text).toBe('切回正在流式的会话');
    expect(frames.size).toBe(0);
  });

  it('keeps emoji, combining marks, flags and Chinese on grapheme boundaries', () => {
    const { result, rerender } = start();
    const units = ['中', '👨‍👩‍👧‍👦', 'e\u0301', '🇨🇳', '👍🏽', '文'];
    const text = units.join('');
    const prefixes = units.map((_, index) => units.slice(0, index + 1).join(''));
    rerender({ text, streaming: true, enabled: true });
    for (let i = 0; i < 4; i++) {
      advance();
      expect(prefixes).toContain(result.current.text);
    }
    expect(result.current.text).toBe(text);
  });

  it('flushes when reduced motion is requested and removes listeners', () => {
    const removed = vi.spyOn(motion, 'removeEventListener');
    const { result, rerender, unmount } = start();
    rerender({ text: '减弱动态效果立即完整展示', streaming: true, enabled: true });
    act(() => { motion.matches = true; motion.dispatchEvent(new Event('change')); });
    expect(result.current.text).toBe('减弱动态效果立即完整展示');
    expect(frames.size).toBe(0);
    unmount();
    expect(removed).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('flushes in background and does not replay old text when visible again', () => {
    const { result, rerender } = start();
    rerender({ text: '已经接收的后台内容', streaming: true, enabled: true });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.text).toBe('已经接收的后台内容');
    expect(frames.size).toBe(0);
    rerender({ text: '已经接收的后台内容，继续', streaming: true, enabled: true });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.text).toBe('已经接收的后台内容，继续');
    expect(frames.size).toBe(0);
  });

  it('clears scheduled frames on unmount', () => {
    const { rerender, unmount } = start();
    rerender({ text: '等待显示', streaming: true, enabled: true });
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });

  it('renders oversized answers and non-prefix replacements immediately', () => {
    const { result, rerender } = start();
    rerender({ text: '长'.repeat(20_001), streaming: true, enabled: true });
    expect(result.current.text).toHaveLength(20_001);
    rerender({ text: '服务器替换了内容', streaming: true, enabled: true });
    expect(result.current.text).toBe('服务器替换了内容');
    expect(frames.size).toBe(0);
  });
});
