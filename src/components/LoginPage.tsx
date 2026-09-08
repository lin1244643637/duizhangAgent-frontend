import { useEffect, useState } from 'react';
import { Button, ConfigProvider, Input, Tabs, notification } from 'antd';

import { getAuthCapabilities, type AuthCapabilities, type IdentifierType, type VerificationChannel } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { PasswordStrengthHint } from './auth/PasswordStrengthHint';
import { isPasswordLengthValid } from './auth/passwordPolicy';
import { VerificationFields } from './auth/VerificationFields';

type PageMode = 'login' | 'register' | 'reset';

const unavailableCapabilities: AuthCapabilities = {
  verification_enabled: false,
  code_login_enabled: false,
  password_reset_enabled: false,
  contact_management_enabled: false,
  register_verification_required: false,
  code_login_reveal_unknown_contact: false,
};

export function LoginPage() {
  const { loginWithPassword, loginWithCode, register, resetPassword } = useAuthStore();
  const [capabilities, setCapabilities] = useState(unavailableCapabilities);
  const [mode, setMode] = useState<PageMode>('login');
  const [loginTab, setLoginTab] = useState<'password' | 'code'>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [channel, setChannel] = useState<VerificationChannel>('email');
  const [target, setTarget] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordLoginRetryAfter, setPasswordLoginRetryAfter] = useState(0);
  const [notice, noticeContext] = notification.useNotification();

  useEffect(() => {
    let active = true;
    getAuthCapabilities()
      .then((value) => {
        if (active) setCapabilities(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (passwordLoginRetryAfter <= 0) return;
    const intervalId = window.setInterval(() => {
      setPasswordLoginRetryAfter((seconds) => Math.max(seconds - 1, 0));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [passwordLoginRetryAfter]);

  function resetForm() {
    setIdentifier('');
    setPassword('');
    setConfirmPassword('');
    setInviteToken('');
    setChannel('email');
    setTarget('');
    setVerificationToken('');
  }

  function switchMode(next: PageMode) {
    resetForm();
    setLoginTab('password');
    setMode(next);
  }

  function showError(error: unknown, fallback: string) {
    notice.error({
      title: error instanceof Error ? error.message : fallback,
      duration: 5,
      closable: true,
    });
  }

  async function handlePasswordLogin(event: React.FormEvent) {
    event.preventDefault();
    if (loading || passwordLoginRetryAfter > 0 || !identifier.trim() || !password) return;
    setLoading(true);
    try {
      const account = inferPasswordIdentifier(identifier);
      await loginWithPassword(account.type, account.identifier, password);
    } catch (error) {
      const retryAfter = retryAfterFrom(error);
      if (retryAfter) {
        setPasswordLoginRetryAfter(retryAfter);
        notice.error({
          title: `登录尝试次数过多，请在 ${retryAfter} 秒后重试`,
          duration: 5,
          closable: true,
        });
      } else {
        showError(error, '登录失败');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!verificationToken) {
      notice.warning({ title: '请先完成验证码确认', duration: 5, closable: true });
      return;
    }
    setLoading(true);
    try {
      await loginWithCode(verificationToken);
    } catch (error) {
      showError(error, '登录失败');
    } finally {
      setLoading(false);
    }
  }

  function validateNewPassword(): boolean {
    if (!isPasswordLengthValid(password)) {
      notice.error({ title: '密码长度必须为 7 至 16 个字符', duration: 5, closable: true });
      return false;
    }
    if (password !== confirmPassword) {
      notice.error({ title: '两次密码不一致', duration: 5, closable: true });
      return false;
    }
    return true;
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    if (!inviteToken.trim()) {
      notice.error({ title: '请输入注册邀请码', duration: 5, closable: true });
      return;
    }
    if (!identifier.trim() || !validateNewPassword()) return;
    if (capabilities.register_verification_required && !verificationToken) {
      notice.warning({ title: '请先完成联系方式验证', duration: 5, closable: true });
      return;
    }
    setLoading(true);
    try {
      await register(identifier.trim(), password, inviteToken.trim(), verificationToken);
    } catch (error) {
      showError(error, '注册失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!verificationToken) {
      notice.warning({ title: '请先完成验证码确认', duration: 5, closable: true });
      return;
    }
    if (!validateNewPassword()) return;
    setLoading(true);
    try {
      await resetPassword(verificationToken, password);
      notice.success({ title: '密码重置成功，请重新登录', duration: 5, closable: true });
      switchMode('login');
    } catch (error) {
      showError(error, '密码重置失败');
    } finally {
      setLoading(false);
    }
  }

  const passwordLogin = (
    <form onSubmit={handlePasswordLogin} className="space-y-4 pt-1">
      <Input
        aria-label="账号"
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        placeholder="请输入用户名/手机号/邮箱"
        autoComplete="username"
        autoFocus
      />
      <Input.Password
        aria-label="密码"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="请输入密码"
        autoComplete="current-password"
      />
      <div className="flex items-center justify-between">
        {capabilities.password_reset_enabled ? (
          <Button type="link" htmlType="button" onClick={() => switchMode('reset')} className="h-auto p-0 text-xs">
            忘记密码
          </Button>
        ) : <span />}
        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          disabled={loading || passwordLoginRetryAfter > 0 || !identifier.trim() || !password}
        >
          {passwordLoginRetryAfter > 0 ? `${passwordLoginRetryAfter} 秒后可重新登录` : '登录'}
        </Button>
      </div>
    </form>
  );

  const codeLogin = (
    <form onSubmit={handleCodeLogin} className="space-y-4 pt-1">
      <VerificationFields
        channel="auto"
        target={target}
        onTargetChange={setTarget}
        purpose="login"
        targetLabel="邮箱或手机号"
        onVerified={setVerificationToken}
      />
      <Button type="primary" htmlType="submit" block loading={loading} disabled={!verificationToken}>
        登录
      </Button>
    </form>
  );

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
        {noticeContext}
        <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <span className="text-base font-semibold">账</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">对账 Agent</h1>
          <p className="mt-1 text-sm text-slate-500">智能财务对账助手</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {mode === 'login' && (
            <>
              <Tabs
                activeKey={loginTab}
                onChange={(key) => {
                  setLoginTab(key as 'password' | 'code');
                  resetForm();
                }}
                items={[
                  { key: 'password', label: '密码登录', children: passwordLogin },
                  ...(capabilities.code_login_enabled
                    ? [{ key: 'code', label: '验证码登录', children: codeLogin }]
                    : []),
                ]}
              />
              <div className="mt-5 border-t border-slate-100 pt-4 text-center">
                <Button type="link" htmlType="button" onClick={() => switchMode('register')} className="h-auto p-0 text-xs">
                  没有账号？立即注册
                </Button>
              </div>
            </>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <h2 className="text-base font-semibold text-slate-800">邀请注册</h2>
              <p className="text-xs leading-5 text-slate-500">请输入管理员在「用户管理」生成的注册邀请码。租户加入码不能用于注册。</p>
              <Input
                aria-label="注册邀请码"
                value={inviteToken}
                onChange={(event) => {
                  setInviteToken(event.target.value);
                  setVerificationToken('');
                }}
                placeholder="请输入注册邀请码"
              />
              <Input
                aria-label="用户名"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
              />
              <Input.Password
                aria-label="密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                autoComplete="new-password"
              />
              <PasswordStrengthHint password={password} />
              <Input.Password
                aria-label="确认密码"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入密码"
                autoComplete="new-password"
              />
              {capabilities.register_verification_required && (
                <VerificationFields
                  channel={channel}
                  onChannelChange={(value) => {
                    setChannel(value);
                    setTarget('');
                    setVerificationToken('');
                  }}
                  target={target}
                  onTargetChange={setTarget}
                  purpose="register"
                  inviteToken={inviteToken}
                  targetLabel="邮箱或手机号"
                  onVerified={setVerificationToken}
                />
              )}
              <Button type="primary" htmlType="submit" block loading={loading}>注册</Button>
              <Button type="link" htmlType="button" block onClick={() => switchMode('login')}>
                已有账号？返回登录
              </Button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <h2 className="text-base font-semibold text-slate-800">找回密码</h2>
              <VerificationFields
                channel={channel}
                onChannelChange={(value) => {
                  setChannel(value);
                  setTarget('');
                  setVerificationToken('');
                }}
                target={target}
                onTargetChange={setTarget}
                purpose="reset_password"
                targetLabel="邮箱或手机号"
                onVerified={setVerificationToken}
              />
              <Input.Password
                aria-label="新密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入新密码"
                autoComplete="new-password"
              />
              <PasswordStrengthHint password={password} />
              <Input.Password
                aria-label="确认新密码"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入新密码"
                autoComplete="new-password"
              />
              <Button type="primary" htmlType="submit" block loading={loading} disabled={!verificationToken}>
                重置密码
              </Button>
              <Button type="link" htmlType="button" block onClick={() => switchMode('login')}>
                返回登录
              </Button>
            </form>
          )}
        </div>
        </div>
      </div>
    </ConfigProvider>
  );
}

function inferPasswordIdentifier(identifier: string): { type: IdentifierType; identifier: string } {
  const value = identifier.trim();
  if (isEmail(value)) return { type: 'email', identifier: value };
  const phone = normalizeMainlandPhone(value);
  if (phone) return { type: 'phone', identifier: phone };
  return { type: 'username', identifier: value };
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeMainlandPhone(value: string): string | null {
  let phone = value.replace(/[\s()\-]/g, '');
  if (phone.startsWith('0086')) phone = phone.slice(4);
  else if (phone.startsWith('+86')) phone = phone.slice(3);
  return /^1[3-9]\d{9}$/.test(phone) ? phone : null;
}

function retryAfterFrom(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as { retryAfter?: unknown }).retryAfter;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : undefined;
}
