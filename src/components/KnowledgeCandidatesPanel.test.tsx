/** KnowledgeCandidatesPanel（管理员候选确认）测试：列表渲染 / 确认后移除 / 无候选不渲染。 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listKnowledgeCandidates = vi.fn();
const confirmKnowledgeCandidate = vi.fn();
const rejectKnowledgeCandidate = vi.fn();

vi.mock('../api/candidates', () => ({
  listKnowledgeCandidates: (...a: unknown[]) => listKnowledgeCandidates(...a),
  confirmKnowledgeCandidate: (...a: unknown[]) => confirmKnowledgeCandidate(...a),
  rejectKnowledgeCandidate: (...a: unknown[]) => rejectKnowledgeCandidate(...a),
}));

import { KnowledgeCandidatesPanel } from './KnowledgeCandidatesPanel';

const sample = {
  id: 'c1', user_id: 'u1', session_id: 's1', kind: 'field',
  source_text: 'X 表示工时', suggested_category: 'connector_query_knowledge',
  suggested_title: '钉钉用户名关联规则', structured_payload: {}, confidence: 0.8,
  status: 'draft', reviewed_by: null, created_at: '2026-06-15T10:00:00+08:00',
};

const analyticsSample = {
  ...sample,
  id: 'c2',
  kind: 'analytics_rule',
  suggested_category: 'analytics_forecast_feedback',
  suggested_title: '中秋节期间休息日营收高于工作日',
  source_text: '中秋节期间休息日营收高于工作日',
  structured_payload: {
    period: '2026-W27',
    granularity: 'week',
    feature_context: {
      features: {
        holiday: {
          source: 'analytics_calendar_days+system_china_calendar',
          same_holiday_history: {
            sample_count: 9,
            rest_day_sample_count: 2,
            workday_sample_count: 7,
            rest_day_avg_net_income: 86007.93,
            workday_avg_net_income: 64929.73,
            raw_rest_day_lift_pct: 0.3246,
          },
        },
      },
    },
  },
};

describe('KnowledgeCandidatesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('渲染候选列表', async () => {
    listKnowledgeCandidates.mockResolvedValue([sample]);
    render(<KnowledgeCandidatesPanel />);
    await waitFor(() => expect(screen.getByText('钉钉用户名关联规则')).toBeTruthy());
    expect(screen.getByText(/待确认知识候选/)).toBeTruthy();
    expect(screen.getByText('保存到知识库')).toBeTruthy();
  });

  it('确认后从列表移除', async () => {
    listKnowledgeCandidates.mockResolvedValue([sample]);
    confirmKnowledgeCandidate.mockResolvedValue({ status: 'confirmed', kb_entry_id: 'kb1' });
    render(<KnowledgeCandidatesPanel />);
    await waitFor(() => expect(screen.getByText('保存到知识库')).toBeTruthy());
    fireEvent.click(screen.getByText('保存到知识库'));
    await waitFor(() => expect(confirmKnowledgeCandidate).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(screen.queryByText('钉钉用户名关联规则')).toBeNull());
  });

  it('确认后提示去知识库检索正式条目', async () => {
    listKnowledgeCandidates.mockResolvedValue([analyticsSample]);
    confirmKnowledgeCandidate.mockResolvedValue({ status: 'confirmed', kb_entry_id: 'kb2' });
    render(<KnowledgeCandidatesPanel />);
    await waitFor(() => expect(screen.getByText('保存到知识库')).toBeTruthy());
    fireEvent.click(screen.getByText('保存到知识库'));
    await waitFor(() => expect(screen.getByText(/已保存到知识库/)).toBeTruthy());
    expect(screen.getByText(/搜索标题/)).toBeTruthy();
    expect(screen.getByText(/analytics_forecast_feedback/)).toBeTruthy();
  });

  it('展示经营预测候选的结构化摘要', async () => {
    listKnowledgeCandidates.mockResolvedValue([analyticsSample]);
    render(<KnowledgeCandidatesPanel />);
    await waitFor(() => expect(screen.getByText('中秋节期间休息日营收高于工作日')).toBeTruthy());
    expect(screen.getByText(/周期：2026-W27/)).toBeTruthy();
    expect(screen.getByText(/样本：9/)).toBeTruthy();
    expect(screen.getByText(/休息日均值：¥86,007.93/)).toBeTruthy();
    expect(screen.getByText(/工作日均值：¥64,929.73/)).toBeTruthy();
    expect(screen.getByText(/休息日提升：32.46%/)).toBeTruthy();
  });

  it('可以展开查看结构化详情', async () => {
    listKnowledgeCandidates.mockResolvedValue([analyticsSample]);
    render(<KnowledgeCandidatesPanel />);
    await waitFor(() => expect(screen.getByText('查看详情')).toBeTruthy());
    fireEvent.click(screen.getByText('查看详情'));
    expect(screen.getByText(/structured_payload/)).toBeTruthy();
    expect(screen.getByText(/raw_rest_day_lift_pct/)).toBeTruthy();
  });

  it('无候选时不渲染任何内容', async () => {
    listKnowledgeCandidates.mockResolvedValue([]);
    const { container } = render(<KnowledgeCandidatesPanel />);
    await waitFor(() => expect(listKnowledgeCandidates).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
