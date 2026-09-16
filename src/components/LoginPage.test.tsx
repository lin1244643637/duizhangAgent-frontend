import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from './LoginPage';

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  loginWithPassword: vi.fn(),
  loginWithCode: vi.fn(),
  register: vi.fn(),
  registerPersonal: vi.fn(),
  resetPassword: vi.fn(),
  getAuthCapabilities: vi.fn(),
  getPhoneStatus: vi.fn(),
  requestVerification: vi.fn(),
  confirmVerification: vi.fn(),
}));

vi.mock('../api/auth', () => ({
  getAuthCapabilities: authMocks.getAuthCapabilities,
  getPhoneStatus: authMocks.getPhoneStatus,
  requestVerification: authMocks.requestVerification,
  confirmVerification: authMocks.confirmVerification,
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({
    login: authMocks.login,
    loginWithPassword: authMocks.loginWithPassword,
    loginWithCode: authMocks.loginWithCode,
    register: authMocks.register,
    registerPersonal: authMocks.registerPersonal,
    resetPassword: authMocks.resetPassword,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    authMocks.login.mockReset();
    authMocks.loginWithPassword.mockReset();
    authMocks.loginWithCode.mockReset();
    authMocks.register.mockReset();
    authMocks.registerPersonal.mockReset();
    authMocks.resetPassword.mockReset();
    authMocks.requestVerification.mockReset();
    authMocks.confirmVerification.mockReset();
    authMocks.getAuthCapabilities.mockReset();
    authMocks.getPhoneStatus.mockReset();
    authMocks.getAuthCapabilities.mockResolvedValue({
      verification_enabled: true,
      code_login_enabled: true,
      password_reset_enabled: true,
      contact_management_enabled: true,
      register_verification_required: true,
      code_login_reveal_unknown_contact: false,
      personal_registration_enabled: false,
    });
    authMocks.requestVerification.mockResolvedValue({
      challenge_id: 'challenge-1',
      message: '验证码已发送',
      expires_in: 300,
      resend_after: 60,
    });
    authMocks.confirmVerification.mockResolvedValue({
      verification_token: 'verification-token',
      expires_in: 600,
    });
    authMocks.getPhoneStatus.mockResolvedValue({
      is_registered: false,
      has_password: false,
      next_step: 'personal_registration',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('submits login credentials', async () => {
    authMocks.loginWithPassword.mockResolvedValue(undefined);

    render(<LoginPage />);

    expect(screen.queryByLabelText('登录标识类型')).toBeNull();
    expect(screen.getByPlaceholderText('请输入用户名/手机号/邮箱')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'admin1' } });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('登录'));

    await waitFor(() => {
      expect(authMocks.loginWithPassword).toHaveBeenCalledWith('username', 'admin1', 'secret123');
    });
  });

  it('counts down before allowing another password login after rate limiting', async () => {
    vi.useFakeTimers();
    authMocks.loginWithPassword.mockRejectedValue(Object.assign(
      new Error('登录尝试次数过多'),
      { retryAfter: 3 },
    ));

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'admin1' } });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('登录尝试次数过多，请在 3 秒后重试')).toBeTruthy();
    expect((screen.getByRole('button', { name: '3 秒后可重新登录' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.submit(screen.getByLabelText('账号').closest('form')!);

    await act(async () => {
      await Promise.resolve();
    });

    expect(authMocks.loginWithPassword).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect((screen.getByRole('button', { name: '登录' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    ['ops@example.com', 'email'],
    ['13900139000', 'phone'],
  ] as const)('infers password login identifier %s as %s', async (identifier, identifierType) => {
    authMocks.loginWithPassword.mockResolvedValue(undefined);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('账号'), { target: { value: identifier } });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('登录'));

    await waitFor(() => {
      expect(authMocks.loginWithPassword).toHaveBeenCalledWith(identifierType, identifier, 'secret123');
    });
  });

  it('logs in with a confirmed email code without sending password fields', async () => {
    authMocks.loginWithCode.mockResolvedValue(undefined);
    render(<LoginPage />);

    fireEvent.click(await screen.findByRole('tab', { name: '验证码登录' }));
    expect(screen.queryByLabelText('验证方式')).toBeNull();
    expect(screen.getByPlaceholderText('请输入手机号/邮箱')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('邮箱或手机号'), { target: { value: 'ops@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    await waitFor(() => expect(authMocks.requestVerification).toHaveBeenCalledWith({
      channel: 'email',
      purpose: 'login',
      target: 'ops@example.com',
    }, undefined));
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '确认验证码' }));
    await waitFor(() => expect(authMocks.confirmVerification).toHaveBeenCalledWith('challenge-1', '123456'));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(authMocks.loginWithCode).toHaveBeenCalledWith('verification-token'));
    expect(authMocks.loginWithPassword).not.toHaveBeenCalled();
    expect(localStorage.getItem('verification_token')).toBeNull();
  });

  it('sends code login to sms when the contact is a phone number', async () => {
    authMocks.loginWithCode.mockResolvedValue(undefined);
    render(<LoginPage />);

    fireEvent.click(await screen.findByRole('tab', { name: '验证码登录' }));
    fireEvent.change(screen.getByLabelText('邮箱或手机号'), { target: { value: '13900139000' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));

    await waitFor(() => expect(authMocks.requestVerification).toHaveBeenCalledWith({
      channel: 'sms',
      purpose: 'login',
      target: '13900139000',
    }, undefined));
  });

  it('rejects an invalid code-login contact before sending verification', async () => {
    render(<LoginPage />);

    fireEvent.click(await screen.findByRole('tab', { name: '验证码登录' }));
    fireEvent.change(screen.getByLabelText('邮箱或手机号'), { target: { value: 'not-a-contact' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));

    expect(await screen.findByText('请输入有效的手机号或邮箱')).toBeTruthy();
    expect(authMocks.requestVerification).not.toHaveBeenCalled();
  });

  it('validates password confirmation before register', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByText('没有账号？立即注册'));
    fireEvent.change(screen.getByPlaceholderText('请输入注册邀请码'), { target: { value: 'invite-token' } });
    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'secret-password' } });
    fireEvent.change(screen.getByPlaceholderText('再次输入密码'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: '注册并加入租户' }));

    expect(await screen.findByText('两次密码不一致')).toBeTruthy();
    expect(authMocks.register).not.toHaveBeenCalled();
  });

  it('shows password strength and accepts seven character register passwords', async () => {
    authMocks.getAuthCapabilities.mockResolvedValue({
      verification_enabled: true,
      code_login_enabled: true,
      password_reset_enabled: true,
      contact_management_enabled: true,
      register_verification_required: false,
      code_login_reveal_unknown_contact: false,
      personal_registration_enabled: false,
    });
    authMocks.register.mockResolvedValue(undefined);
    render(<LoginPage />);

    fireEvent.click(screen.getByText('没有账号？立即注册'));
    fireEvent.change(screen.getByPlaceholderText('请输入注册邀请码'), { target: { value: 'invite-token' } });
    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'abc1234' } });
    fireEvent.change(screen.getByPlaceholderText('再次输入密码'), { target: { value: 'abc1234' } });
    expect(screen.getByText('密码强度：一般')).toBeTruthy();
    expect(screen.getByText('大于 6 位，最多 16 位')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '注册并加入租户' }));

    await waitFor(() => expect(authMocks.register).toHaveBeenCalledWith('newuser', 'abc1234', 'invite-token', ''));
  });

  it('checks the phone before personal registration and signs in after verification', async () => {
    authMocks.getAuthCapabilities.mockResolvedValue({
      verification_enabled: true,
      code_login_enabled: true,
      password_reset_enabled: true,
      contact_management_enabled: true,
      register_verification_required: true,
      code_login_reveal_unknown_contact: false,
      personal_registration_enabled: true,
    });
    authMocks.registerPersonal.mockResolvedValue(undefined);
    render(<LoginPage />);

    fireEvent.click(await screen.findByText('没有账号？立即注册'));
    fireEvent.change(await screen.findByLabelText('手机号'), { target: { value: '13800138000' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));

    await waitFor(() => expect(authMocks.getPhoneStatus).toHaveBeenCalledWith('13800138000'));
    expect(authMocks.requestVerification).toHaveBeenCalledWith({
      channel: 'sms',
      purpose: 'personal_register',
      target: '13800138000',
    }, undefined);

    fireEvent.change(await screen.findByLabelText('验证码'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '确认验证码' }));
    await waitFor(() => expect(authMocks.confirmVerification).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '创建个人账号' }));

    await waitFor(() => expect(authMocks.registerPersonal).toHaveBeenCalledWith('verification-token'));
  });

  it('redirects an existing phone to login without sending a registration code', async () => {
    authMocks.getAuthCapabilities.mockResolvedValue({
      verification_enabled: true,
      code_login_enabled: true,
      password_reset_enabled: true,
      contact_management_enabled: true,
      register_verification_required: true,
      code_login_reveal_unknown_contact: false,
      personal_registration_enabled: true,
    });
    authMocks.getPhoneStatus.mockResolvedValue({
      is_registered: true,
      has_password: true,
      next_step: 'password',
    });
    render(<LoginPage />);

    fireEvent.click(await screen.findByText('没有账号？立即注册'));
    fireEvent.change(await screen.findByLabelText('手机号'), { target: { value: '13800138000' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));

    await waitFor(() => expect(screen.getByPlaceholderText('请输入密码')).toBeTruthy());
    expect((screen.getByLabelText('账号') as HTMLInputElement).value).toBe('13800138000');
    expect(authMocks.requestVerification).not.toHaveBeenCalled();
  });

  it('resets password only after verification and returns to password login', async () => {
    authMocks.resetPassword.mockResolvedValue(undefined);
    render(<LoginPage />);

    fireEvent.click(await screen.findByRole('button', { name: '忘记密码' }));
    fireEvent.change(screen.getByLabelText('邮箱或手机号'), { target: { value: 'ops@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    fireEvent.change(await screen.findByLabelText('验证码'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '确认验证码' }));
    await waitFor(() => expect(authMocks.confirmVerification).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText('输入新密码'), { target: { value: 'Secure9' } });
    fireEvent.change(screen.getByPlaceholderText('再次输入新密码'), { target: { value: 'Secure9' } });
    fireEvent.click(screen.getByRole('button', { name: '重置密码' }));

    await waitFor(() => expect(authMocks.resetPassword).toHaveBeenCalledWith('verification-token', 'Secure9'));
    expect(await screen.findByRole('tab', { name: '密码登录' })).toBeTruthy();
    expect(authMocks.loginWithCode).not.toHaveBeenCalled();
  });
});
