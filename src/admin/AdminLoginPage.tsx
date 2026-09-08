import { useState } from 'react';
import { Button, Input } from 'antd';
import { useAdminStore } from './adminStore';

/**
 * 平台后台登录页。视觉上与租户登录页严格区分：
 * 深色背景 + 红/橙色"平台管理"角标，防止运维误以为在租户后台。
 */
export function AdminLoginPage() {
  const { login, error, loading } = useAdminStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    await login(username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            平台管理后台
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-100">运维登录</h1>
          <p className="mt-1 text-sm text-slate-400">仅平台管理员可访问此入口</p>
        </div>

        <form
          onSubmit={submit}
          className="bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700 p-6 shadow-2xl"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">用户名</label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="平台管理员账号"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">密码</label>
              <Input.Password
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}
            <Button
              htmlType="submit"
              disabled={loading || !username || !password}
              className="h-auto w-full py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:from-orange-600 hover:to-red-600 transition-colors"
            >
              {loading ? '登录中…' : '登录'}
            </Button>
          </div>
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          凭账号由运维通过环境变量 PLATFORM_ADMIN_* 配置
        </p>
      </div>
    </div>
  );
}
