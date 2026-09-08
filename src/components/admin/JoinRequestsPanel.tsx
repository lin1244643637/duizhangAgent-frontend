import { useEffect, useState } from 'react';
import { Alert, Button } from 'antd';
import { approveJoinRequest, listJoinRequests, rejectJoinRequest, type JoinRequest } from '../../api/admin';

/**
 * 迁入租户申请审批面板：用户凭租户码申请加入本租户，管理员在此通过/驳回。
 * 自包含状态，挂在后台「用户」标签页。
 */
export function JoinRequestsPanel() {
  const [items, setItems] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setItems(await listJoinRequests());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setError(null);
    try {
      if (action === 'approve') await approveJoinRequest(id);
      else await rejectJoinRequest(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">加入申请</h3>
          <p className="mt-0.5 text-xs text-slate-400">用户凭租户码申请迁入本租户，审批通过后其下次登录生效。</p>
        </div>
        <span className="text-[11px] text-slate-400">待处理 {items.length}</span>
      </div>

	      {error && (
	        <Alert showIcon={false} type="error" title={error} className="mb-3 rounded-lg border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600" />
	      )}

      {loading ? (
        <p className="py-4 text-center text-xs text-slate-400">加载中…</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">暂无待处理的加入申请</p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
              <div className="min-w-0 text-sm">
                <span className="font-medium text-slate-800">{it.username}</span>
                <span className="ml-2 text-xs text-slate-400">来自：{it.from_brand || it.from_tenant_id}</span>
              </div>
              <div className="flex shrink-0 gap-2">
	                <Button
	                  autoInsertSpace={false}
	                  onClick={() => decide(it.id, 'approve')}
	                  disabled={busyId === it.id}
	                  className="h-auto rounded-lg bg-emerald-500 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
	                >
	                  通过
	                </Button>
	                <Button
	                  autoInsertSpace={false}
	                  onClick={() => decide(it.id, 'reject')}
	                  disabled={busyId === it.id}
	                  className="h-auto rounded-lg border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
	                >
	                  驳回
	                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
