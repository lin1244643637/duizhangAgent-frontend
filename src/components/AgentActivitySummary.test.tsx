/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AgentActivity } from '../types';
import { AgentActivitySummary } from './AgentActivitySummary';

const activity: AgentActivity = {
  version: 'v1',
  status: 'completed',
  label: '分析活动已完成',
  elapsed_ms: 1800,
  steps: [
    { step_id: 'scope', label: '理解问题与门店范围', status: 'completed', elapsed_ms: 600, sequence: 1 },
    { step_id: 'load', label: '读取销售日快照', status: 'completed', elapsed_ms: 1200, sequence: 2 },
  ],
  scope: ['凤八店'],
  sources: ['销售日快照'],
};

describe('AgentActivitySummary', () => {
  it('starts completed activity collapsed and exposes a keyboard disclosure with bounded details', () => {
    render(<AgentActivitySummary activity={activity} />);

    const disclosure = screen.getByRole('button', { name: /已完成 2 项分析活动.*1\.8 秒/ });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure.getAttribute('aria-controls')).toBeTruthy();
    expect(screen.queryByText('读取销售日快照')).toBeNull();

    fireEvent.click(disclosure);

    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    const details = document.getElementById(disclosure.getAttribute('aria-controls') ?? '');
    expect(details).not.toBeNull();
    expect(screen.getByText('读取销售日快照')).toBeTruthy();
    expect(screen.getByText('凤八店')).toBeTruthy();
    expect(screen.getByText('销售日快照')).toBeTruthy();
  });

  it('shows the current running step without announcing heartbeat-only elapsed changes', () => {
    const { rerender } = render(<AgentActivitySummary activity={{ ...activity, status: 'running', elapsed_ms: 1200 }} />);
    expect(screen.getByRole('button', { name: /读取销售日快照.*1\.2 秒/ })).toBeTruthy();
    const announcement = screen.getByRole('status');
    const before = announcement.textContent;

    rerender(<AgentActivitySummary activity={{ ...activity, status: 'running', elapsed_ms: 1500 }} />);

    expect(screen.getByRole('button', { name: /读取销售日快照.*1\.5 秒/ })).toBeTruthy();
    expect(announcement.textContent).toBe(before);
  });

  it('omits elapsed time when the backend did not measure it', () => {
    render(<AgentActivitySummary activity={{
      ...activity,
      status: 'completed',
      elapsed_ms: 0,
      total_duration_ms: undefined,
    }} />);

    expect(screen.getByRole('button', { name: /已完成 2 项分析活动/ }).textContent).not.toContain('0.0 秒');
  });

  it('shows the latest running stage even when its stable sequence sorts before another step', () => {
    render(<AgentActivitySummary activity={{
      ...activity,
      status: 'running',
      label: '理解问题与门店范围',
      elapsed_ms: 700,
    }} />);

    expect(screen.getByRole('button', { name: /理解问题与门店范围.*0\.7 秒/ })).toBeTruthy();
  });

  it.each([
    ['partial', '部分结果可用'],
    ['empty', '暂无匹配数据'],
    ['unavailable', '数据暂不可用'],
    ['failed', '分析活动失败'],
  ] as const)('shows a truthful %s terminal and uses the server total', (status, label) => {
    render(<AgentActivitySummary activity={{
      ...activity,
      status,
      label,
      total_duration_ms: 175,
    } as AgentActivity} />);

    const disclosure = screen.getByRole('button', { name: new RegExp(`${label}.*0\\.2 秒`) });
    expect(disclosure.textContent).not.toContain('已完成');
  });
});
