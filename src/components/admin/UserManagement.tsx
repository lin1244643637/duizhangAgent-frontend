import { useEffect, useState } from 'react';
import { Button, Input, Select, Table, type TableColumnsType } from 'antd';
import type { AdminUser, AdminTenant } from '../../types';
import { listUsers, createUser, updateUserRole, resetUserPassword, deleteUser } from '../../api/admin';
import { TableDisplayFrame } from '../TableDisplayFrame';
import { formatBeijingTime } from '../../utils/time';
import { ConfirmDialog } from '../ConfirmDialog';
import { FloatingNotice, type FloatingNoticeState } from '../FloatingNotice';
import { RegistrationInvitesPanel } from './RegistrationInvitesPanel';

interface UserManagementProps {
  tenants: AdminTenant[];
}

export function UserManagement({ tenants }: UserManagementProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', tenant_id: tenants[0]?.id ?? '', role: 'member' });
  const [notice, setNotice] = useState<FloatingNoticeState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => Promise<void> } | null>(null);

  function showNotice(message: string, variant: FloatingNoticeState['variant'] = 'info') {
    setNotice({ message, variant });
  }

  useEffect(() => {
    if (tenants[0]?.id) {
      setNewUser((prev) => ({ ...prev, tenant_id: tenants[0].id }));
    }
  }, [tenants]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const data = await listUsers({ search: search || undefined });
      setUsers(data.users);
      setTotal(data.total);
    } catch (e) {
      console.error('Failed to load users:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, [search]);

  async function handleCreate() {
    if (!newUser.username || !newUser.password) return;
    try {
      await createUser(newUser);
      setShowCreate(false);
      setNewUser({ username: '', password: '', tenant_id: tenants[0]?.id ?? '', role: 'member' });
      fetchUsers();
      showNotice('用户已创建', 'success');
    } catch (e) {
      showNotice(e instanceof Error ? e.message : '创建失败', 'error');
    }
  }

  async function handleRoleChange(user: AdminUser) {
    const newRole = user.role === 'member' ? 'admin' : 'member';
    try {
      await updateUserRole(user.id, newRole);
      fetchUsers();
      showNotice('用户角色已更新', 'success');
    } catch (e) {
      showNotice(e instanceof Error ? e.message : '角色更新失败', 'error');
    }
  }

  async function handleResetPassword(id: string) {
    try {
      const data = await resetUserPassword(id);
      showNotice('新密码: ' + data.new_password, 'warning');
    } catch (e) {
      showNotice(e instanceof Error ? e.message : '密码重置失败', 'error');
    }
  }

  async function handleDelete(id: string) {
    setConfirmDialog({
      title: '删除用户',
      message: '确定删除该用户？',
      onConfirm: async () => {
        await deleteUser(id);
        fetchUsers();
        showNotice('用户已删除', 'success');
      },
    });
  }

  async function handleConfirmDialog() {
    if (!confirmDialog) return;
    try {
      await confirmDialog.onConfirm();
    } catch (e) {
      showNotice(e instanceof Error ? e.message : '删除失败', 'error');
    } finally {
      setConfirmDialog(null);
    }
  }

  const tenantNameMap: Record<string, string> = {};
  tenants.forEach((t) => { tenantNameMap[t.id] = t.brand_name; });
  const inputCls = 'px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const columns: TableColumnsType<AdminUser> = [
    {
      title: '用户名',
      dataIndex: 'username',
      render: (value) => <span className="font-medium">{value}</span>,
    },
    {
      title: '所属租户',
      dataIndex: 'tenant_id',
      render: (tenantId) => <span className="text-slate-500">{tenantNameMap[tenantId] ?? tenantId}</span>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      render: (role) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>{role}</span>
      ),
    },
    {
      title: '需改密',
      dataIndex: 'must_change_password',
      render: (mustChange) => (mustChange ? <span className="text-amber-600">是</span> : <span className="text-slate-400">否</span>),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      render: (createdAt) => <span className="text-slate-500">{formatBeijingTime(createdAt, { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      align: 'right',
      render: (_, u) => (
        <div className="space-x-2">
          <Button autoInsertSpace={false} type="text" onClick={() => handleRoleChange(u)} className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:text-blue-800">{u.role === 'admin' ? '降为成员' : '升为管理员'}</Button>
          <Button autoInsertSpace={false} type="text" onClick={() => handleResetPassword(u.id)} className="h-auto border-0 p-0 text-xs text-amber-600 shadow-none hover:text-amber-800">重置密码</Button>
          <Button autoInsertSpace={false} type="text" onClick={() => handleDelete(u.id)} className="h-auto border-0 p-0 text-xs text-red-600 shadow-none hover:text-red-800">删除</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <RegistrationInvitesPanel />
	      <div className="flex items-center justify-between">
	        <Input type="text" placeholder="搜索用户名..." value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + ' w-64'} />
	        <Button autoInsertSpace={false} onClick={() => setShowCreate(!showCreate)} className="h-auto rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600">+ 新建用户</Button>
	      </div>

      {showCreate && (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
	          <div className="grid grid-cols-2 gap-3">
	            <Input placeholder="用户名" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} className={inputCls} />
	            <Input.Password placeholder="密码" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className={inputCls} />
	            {tenants.length > 1 ? (
	              <Select
	                value={newUser.tenant_id}
	                onChange={(tenant_id) => setNewUser({ ...newUser, tenant_id })}
	                className={inputCls}
	                options={tenants.map(t => ({ value: t.id, label: t.brand_name }))}
	              />
	            ) : (
	              <div className={`${inputCls} bg-slate-50 text-slate-500`}>{tenants[0]?.brand_name ?? '当前租户'}</div>
	            )}
	            <Select
	              value={newUser.role}
	              onChange={(role) => setNewUser({ ...newUser, role })}
	              className={inputCls}
	              options={[
	                { value: 'member', label: 'Member' },
	                { value: 'admin', label: 'Admin' },
	              ]}
	            />
	          </div>
	          <div className="flex gap-2">
	            <Button autoInsertSpace={false} onClick={handleCreate} className="h-auto rounded bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600">创建</Button>
	            <Button autoInsertSpace={false} onClick={() => setShowCreate(false)} className="h-auto rounded bg-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-300">取消</Button>
	          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400">加载中...</div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <TableDisplayFrame title="用户管理列表" filename="用户管理列表" tableClassName="overflow-x-auto">
            <Table<AdminUser>
              rowKey="id"
              columns={columns}
              dataSource={users}
              pagination={false}
              size="small"
              locale={{ emptyText: '无数据' }}
            />
          </TableDisplayFrame>
        </div>
      )}
      <div className="text-xs text-slate-400">共 {total} 位用户</div>
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel="确认"
          onConfirm={handleConfirmDialog}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {notice && <FloatingNotice notice={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
