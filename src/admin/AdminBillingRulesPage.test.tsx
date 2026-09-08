import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listActiveRules, listRulesHistory } from './adminApi';
import { AdminBillingRulesPage } from './AdminBillingRulesPage';

vi.mock('./adminApi', () => ({
  listActiveRules: vi.fn(),
  listRulesHistory: vi.fn(),
  upsertRule: vi.fn(),
}));

const rule = {
  id: 'rule-1',
  model_pattern: 'claude-*',
  cache_hit_rate_per_m_yuan: '0.02',
  cache_write_rate_per_m_yuan: '1.25',
  cache_miss_rate_per_m_yuan: '1',
  output_rate_per_m_yuan: '2',
  effective_from: '2026-08-01T00:00:00+08:00',
  effective_to: null,
  created_at: '2026-08-01T00:00:00+08:00',
};

describe('AdminBillingRulesPage', () => {
  beforeEach(() => {
    vi.mocked(listActiveRules).mockReset();
    vi.mocked(listRulesHistory).mockReset();
    vi.mocked(listActiveRules).mockResolvedValue([rule]);
    vi.mocked(listRulesHistory).mockResolvedValue([{ ...rule, effective_to: '2026-08-05T00:00:00+08:00' }]);
  });

  it('opens editors and history in detail drawers', async () => {
    render(<AdminBillingRulesPage />);
    await screen.findByText('claude-*');

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    const editor = screen.getByRole('dialog');
    expect(within(editor).getByText('编辑规则')).toBeTruthy();
    fireEvent.click(within(editor).getByLabelText('关闭详情抽屉'));

    fireEvent.click(screen.getByRole('button', { name: '查看历史版本' }));
    const history = screen.getByRole('dialog');
    await waitFor(() => expect(within(history).getByText('历史版本')).toBeTruthy());
    expect(listRulesHistory).toHaveBeenCalledWith('claude-*');
  });
});
