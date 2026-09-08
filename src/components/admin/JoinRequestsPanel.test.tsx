import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { approveJoinRequest, listJoinRequests, rejectJoinRequest } from '../../api/admin';
import { JoinRequestsPanel } from './JoinRequestsPanel';

vi.mock('../../api/admin', () => ({
  approveJoinRequest: vi.fn(),
  listJoinRequests: vi.fn(),
  rejectJoinRequest: vi.fn(),
}));

describe('JoinRequestsPanel', () => {
  beforeEach(() => {
    vi.mocked(approveJoinRequest).mockReset();
    vi.mocked(rejectJoinRequest).mockReset();
    vi.mocked(listJoinRequests).mockReset();
    vi.mocked(listJoinRequests)
      .mockResolvedValueOnce([
        {
          id: 'req-1',
          user_id: 'user-1',
          username: 'linhao',
          from_tenant_id: 'tenant-old',
          from_brand: '原租户',
          created_at: '2026-07-03T10:00:00+08:00',
        },
      ])
      .mockResolvedValue([]);
    vi.mocked(approveJoinRequest).mockResolvedValue(undefined);
    vi.mocked(rejectJoinRequest).mockResolvedValue(undefined);
  });

  it('approves a pending join request and refreshes the list', async () => {
    render(<JoinRequestsPanel />);

    expect(await screen.findByText('linhao')).toBeTruthy();
    fireEvent.click(screen.getByText('通过'));

    await waitFor(() => {
      expect(approveJoinRequest).toHaveBeenCalledWith('req-1');
      expect(listJoinRequests).toHaveBeenCalledTimes(2);
    });
  });
});
