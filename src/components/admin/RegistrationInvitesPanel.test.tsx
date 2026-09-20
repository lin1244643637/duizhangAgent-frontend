import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRegistrationInvite, listRegistrationInvites } from '../../api/admin';
import { RegistrationInvitesPanel } from './RegistrationInvitesPanel';

vi.mock('../../api/admin', () => ({
  createRegistrationInvite: vi.fn(),
  listRegistrationInvites: vi.fn(),
}));

describe('RegistrationInvitesPanel', () => {
  beforeEach(() => {
    vi.mocked(createRegistrationInvite).mockReset();
    vi.mocked(listRegistrationInvites).mockReset();
    vi.mocked(listRegistrationInvites).mockResolvedValue([{
      id: 'invite-1',
      tenant_id: 'tenant-a',
      role: 'member',
      created_by: 'admin-a',
      expires_at: '2026-08-26T12:00:00+08:00',
      used_at: null,
      used_by: null,
      revoked_at: null,
      status: 'active',
      invite_token: 'AB12cd34EF',
      invite_email: 'member@example.com',
    }]);
    vi.mocked(createRegistrationInvite).mockResolvedValue({
      invite_token: 'new-raw-token',
      email_sent: false,
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('generates a one-time registration invite and refreshes recent statuses', async () => {
    render(<RegistrationInvitesPanel />);

    expect(await screen.findByText('注册邀请码')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '邀请用户' }));
    fireEvent.click(screen.getByRole('button', { name: '生成注册邀请码' }));

    await waitFor(() => {
      expect(createRegistrationInvite).toHaveBeenCalledWith(1440, '');
      expect(screen.getByText(/new-raw-token/)).toBeTruthy();
      expect(listRegistrationInvites).toHaveBeenCalledTimes(2);
    });
  });

  it('finishes loading when React StrictMode remounts the component', async () => {
    render(
      <StrictMode>
        <RegistrationInvitesPanel />
      </StrictMode>,
    );

    expect(await screen.findByText('AB12cd34EF')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: '邀请用户' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('sends an invite to the entered email address', async () => {
    vi.mocked(createRegistrationInvite).mockResolvedValue({
      invite_token: 'emailed-token',
      email_sent: true,
    });
    render(<RegistrationInvitesPanel />);

    fireEvent.click(screen.getByRole('button', { name: '邀请用户' }));
    fireEvent.change(screen.getByRole('textbox', { name: '接收邀请的邮箱' }), {
      target: { value: 'USER@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送邀请邮件' }));

    await waitFor(() => {
      expect(createRegistrationInvite).toHaveBeenCalledWith(1440, 'USER@example.com');
      expect(screen.getByText('邀请邮件已发送')).toBeTruthy();
    });
    expect(screen.queryByRole('textbox', { name: '接收邀请的邮箱' })).toBeNull();
  });

  it('rejects an invalid email address before creating an invite', async () => {
    render(<RegistrationInvitesPanel />);

    fireEvent.click(screen.getByRole('button', { name: '邀请用户' }));
    fireEvent.change(screen.getByRole('textbox', { name: '接收邀请的邮箱' }), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送邀请邮件' }));

    expect(await screen.findAllByText('请输入有效的邮箱地址')).toHaveLength(2);
    expect(createRegistrationInvite).not.toHaveBeenCalled();
  });

  it('allows copying an active invite from the recent invite table', async () => {
    render(<RegistrationInvitesPanel />);

    expect(await screen.findByText('AB12cd34EF')).toBeTruthy();
    expect(screen.getByText('member@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '复制邀请码 AB12cd34EF' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('AB12cd34EF');
    });
  });
});
