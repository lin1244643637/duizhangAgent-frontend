import { useEffect, useRef, useState } from 'react';
import { Button, Select, Table, type TableColumnsType } from 'antd';

import {
  createRegistrationInvite,
  listRegistrationInvites,
  type RegistrationInvite,
  type RegistrationInviteStatus,
} from '../../api/admin';
import { formatBeijingTime } from '../../utils/time';
import { FloatingNotice, type FloatingNoticeState } from '../FloatingNotice';

const STATUS_LABEL: Record<RegistrationInviteStatus, string> = {
  active: '可用',
  used: '已使用',
  expired: '已过期',
  revoked: '已撤销',
};

const STATUS_CLASS: Record<RegistrationInviteStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  used: 'bg-slate-100 text-slate-600',
  expired: 'bg-amber-50 text-amber-700',
  revoked: 'bg-red-50 text-red-700',
};

export function RegistrationInvitesPanel() {
  const [items, setItems] = useState<RegistrationInvite[]>([]);
  const [expiresMinutes, setExpiresMinutes] = useState(1440);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [latestToken, setLatestToken] = useState('');
  const [notice, setNotice] = useState<FloatingNoticeState | null>(null);
  const mountedRef = useRef(true);

  function showNotice(message: string, variant: FloatingNoticeState['variant'] = 'info') {
    if (!mountedRef.current) return;
    setNotice({ message, variant });
  }

  async function fetchInvites() {
    setLoading(true);
    try {
      const nextItems = await listRegistrationInvites();
      if (mountedRef.current) setItems(nextItems);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '加载注册邀请码失败', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      showNotice('注册邀请码已复制', 'success');
    } catch {
      showNotice(`注册邀请码：${token}`, 'info');
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const result = await createRegistrationInvite(expiresMinutes);
      if (!mountedRef.current) return;
      setLatestToken(result.invite_token);
      await fetchInvites();
      showNotice('注册邀请码已生成，请及时复制', 'success');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '生成注册邀请码失败', 'error');
    } finally {
      if (mountedRef.current) setCreating(false);
    }
  }

  useEffect(() => {
    void fetchInvites();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const columns: TableColumnsType<RegistrationInvite> = [
    {
      title: '状态',
      dataIndex: 'status',
      width: 88,
      render: (status: RegistrationInviteStatus) => (
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 80,
      render: (role) => <span className="text-slate-600">{role === 'admin' ? '管理员' : '成员'}</span>,
    },
    {
      title: '邀请码',
      dataIndex: 'invite_token',
      width: 180,
      render: (token: string | null) => token ? (
        <div className="flex items-center gap-2">
          <code className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-800">{token}</code>
          <Button size="small" aria-label={`复制邀请码 ${token}`} onClick={() => { void copyToken(token); }}>复制</Button>
        </div>
      ) : (
        <span className="text-slate-400">不可复制</span>
      ),
    },
    {
      title: '过期时间',
      dataIndex: 'expires_at',
      render: (value) => (
        <span className="text-slate-600">
          {value ? formatBeijingTime(String(value), { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
        </span>
      ),
    },
    {
      title: '使用状态',
      key: 'usage',
      render: (_, row) => (
        <span className="text-slate-500">
          {row.used_at ? `使用于 ${formatBeijingTime(row.used_at, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '未使用'}
        </span>
      ),
    },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">注册邀请码</h3>
          <p className="mt-1 text-xs text-slate-500">用于新用户注册。租户加入码只给已有账号申请加入，不能用于注册。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="注册邀请码有效期"
            value={expiresMinutes}
            onChange={setExpiresMinutes}
            options={[
              { value: 1440, label: '24 小时' },
              { value: 2880, label: '48 小时' },
              { value: 10080, label: '7 天' },
            ]}
            className="w-28"
          />
          <Button type="primary" loading={creating} onClick={handleCreate}>生成注册邀请码</Button>
        </div>
      </div>

      {latestToken ? (
        <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-3">
          <div className="text-xs text-blue-700">邀请码已生成，可复制后发送给新成员，也可在下方可用记录中再次复制。</div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded border border-blue-100 bg-white px-2 py-1 text-sm text-slate-800">{latestToken}</code>
            <Button onClick={() => { void copyToken(latestToken); }}>复制</Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <Table<RegistrationInvite>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无注册邀请码' }}
        />
      </div>
      {notice && <FloatingNotice notice={notice} onClose={() => setNotice(null)} />}
    </section>
  );
}
