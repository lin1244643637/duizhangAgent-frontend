import { useEffect, useId, useState } from 'react';
import { Button, Input, Radio, notification } from 'antd';

import {
  AuthApiError,
  confirmVerification,
  requestVerification,
  type VerificationChannel,
  type VerificationPurpose,
} from '../../api/auth';

interface VerificationFieldsProps {
  channel: VerificationInputChannel;
  onChannelChange?: (channel: VerificationChannel) => void;
  target: string;
  onTargetChange: (target: string) => void;
  purpose: VerificationPurpose;
  onVerified: (verificationToken: string) => void;
  inviteToken?: string;
  authToken?: string | null;
  targetLabel?: string;
  showChannelSelector?: boolean;
}

type VerificationInputChannel = VerificationChannel | 'auto';

export function VerificationFields({
  channel,
  onChannelChange,
  target,
  onTargetChange,
  purpose,
  onVerified,
  inviteToken = '',
  authToken,
  targetLabel,
  showChannelSelector = true,
}: VerificationFieldsProps) {
  const id = useId();
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [verified, setVerified] = useState(false);
  const [notice, noticeContext] = notification.useNotification();
  const resolvedChannel = resolveVerificationChannel(channel, target);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  function resetVerification() {
    setChallengeId('');
    setCode('');
    setVerified(false);
    onVerified('');
  }

  function handleChannelChange(next: VerificationChannel) {
    resetVerification();
    onChannelChange?.(next);
  }

  function handleTargetChange(value: string) {
    resetVerification();
    onTargetChange(value);
  }

  async function handleSend() {
    if (!target.trim() || sending || countdown > 0) return;
    const validationError = validateTarget(channel, target);
    if (validationError) {
      notice.error({ title: validationError, duration: 5, closable: true });
      return;
    }
    setSending(true);
    resetVerification();
    try {
      const response = await requestVerification({
        channel: resolvedChannel,
        purpose,
        target: target.trim(),
        ...(inviteToken.trim() ? { invite_token: inviteToken.trim() } : {}),
      }, authToken);
      setChallengeId(response.challenge_id);
      setCountdown(response.resend_after || 60);
      notice.success({
        title: response.message || '验证码已发送',
        duration: 5,
        closable: true,
      });
    } catch (error) {
      if (error instanceof AuthApiError && error.retryAfter) {
        setCountdown(error.retryAfter);
      }
      notice.error({
        title: error instanceof Error ? error.message : '验证码发送失败',
        duration: 5,
        closable: true,
      });
    } finally {
      setSending(false);
    }
  }

  async function handleConfirm() {
    if (!challengeId || !code.trim() || confirming) return;
    setConfirming(true);
    try {
      const response = await confirmVerification(challengeId, code.trim());
      setVerified(true);
      onVerified(response.verification_token);
      notice.success({ title: '验证成功', duration: 5, closable: true });
    } catch (error) {
      setVerified(false);
      onVerified('');
      notice.error({
        title: error instanceof Error ? error.message : '验证码无效或已过期',
        duration: 5,
        closable: true,
      });
    } finally {
      setConfirming(false);
    }
  }

  const resolvedTargetLabel = targetLabel ?? (channel === 'email' ? '邮箱' : '手机号');
  const targetPlaceholder = channel === 'auto'
    ? '请输入手机号/邮箱'
    : channel === 'email' ? '请输入邮箱' : '请输入中国大陆手机号';

  return (
    <div className="space-y-3">
      {noticeContext}
      {showChannelSelector && channel !== 'auto' && (
        <Radio.Group
          aria-label="验证方式"
          optionType="button"
          buttonStyle="solid"
          value={channel}
          onChange={(event) => handleChannelChange(event.target.value as VerificationChannel)}
          options={[
            { label: '邮箱', value: 'email' },
            { label: '手机号', value: 'sms' },
          ]}
        />
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-600" htmlFor={`${id}-target`}>
          {resolvedTargetLabel}
        </label>
        <div className="flex gap-2">
          <Input
            id={`${id}-target`}
            aria-label={resolvedTargetLabel}
            value={target}
            onChange={(event) => handleTargetChange(event.target.value)}
            placeholder={targetPlaceholder}
            autoComplete={channel === 'auto' ? 'off' : resolvedChannel === 'email' ? 'email' : 'tel'}
          />
          <Button
            htmlType="button"
            loading={sending}
            disabled={!target.trim() || countdown > 0}
            onClick={handleSend}
            className="min-w-28"
          >
            {countdown > 0 ? `${countdown} 秒` : '获取验证码'}
          </Button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-600" htmlFor={`${id}-code`}>
          验证码
        </label>
        <div className="flex gap-2">
          <Input
            id={`${id}-code`}
            aria-label="验证码"
            inputMode="numeric"
            maxLength={8}
            value={code}
            disabled={!challengeId || verified}
            onChange={(event) => {
              setCode(event.target.value);
              setVerified(false);
              onVerified('');
            }}
            placeholder="请输入验证码"
          />
          <Button
            htmlType="button"
            loading={confirming}
            disabled={!challengeId || !code.trim() || verified}
            onClick={handleConfirm}
            className="min-w-28"
          >
            {verified ? '已验证' : '确认验证码'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function validateTarget(channel: VerificationInputChannel, target: string): string | null {
  const value = target.trim();
  if (channel === 'auto') {
    return isEmail(value) || normalizeMainlandPhone(value) ? null : '请输入有效的手机号或邮箱';
  }
  if (channel === 'email') return isEmail(value) ? null : '请输入有效的邮箱地址';
  return normalizeMainlandPhone(value) ? null : '请输入有效的中国大陆手机号';
}

function resolveVerificationChannel(channel: VerificationInputChannel, target: string): VerificationChannel {
  if (channel !== 'auto') return channel;
  return normalizeMainlandPhone(target) ? 'sms' : 'email';
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
