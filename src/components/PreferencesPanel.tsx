import { useEffect, useState } from 'react';
import { Button, Input, Select } from 'antd';
import { clearMyPreferences, getMyPreferences, updateMyPreferences, type UserPreferences } from '../api/preferences';

const DIM_LABELS: Record<string, string> = {
  store: '常查门店',
  platform: '常用平台',
  scope: '常用范围',
  source: '常用数据源',
  granularity: '常用粒度',
};

function topValues(counts: unknown): string[] {
  if (!counts || typeof counts !== 'object') return [];
  return Object.entries(counts as Record<string, number>)
    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
    .slice(0, 3)
    .map(([value]) => value);
}

/**
 * 个人中心「我的偏好」面板（方案 P5）。
 * 显性设置仅影响本人查询消歧/展示；本轮明确指定时仍以本轮为准。read-only 区展示系统观察到的常用项。
 */
export function PreferencesPanel() {
  const [prefs, setPrefs] = useState<UserPreferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [scope, setScope] = useState('');
  const [granularity, setGranularity] = useState('');
  const [downloadFormat, setDownloadFormat] = useState('');
  const [answerLevel, setAnswerLevel] = useState('');

  function hydrate(p: UserPreferences) {
    setPrefs(p);
    const ex = (p.explicit ?? {}) as Record<string, string>;
    setScope(ex.scope ?? '');
    setGranularity(ex.granularity ?? '');
    setDownloadFormat(ex.download_format ?? '');
    setAnswerLevel(ex.answer_level ?? '');
  }

  useEffect(() => {
    getMyPreferences()
      .then(hydrate)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const explicit: Record<string, string> = {};
      if (scope.trim()) explicit.scope = scope.trim();
      if (granularity) explicit.granularity = granularity;
      if (downloadFormat) explicit.download_format = downloadFormat;
      if (answerLevel) explicit.answer_level = answerLevel;
      hydrate(await updateMyPreferences(explicit));
      setMsg('已保存');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setMsg('');
    try {
      await clearMyPreferences();
      hydrate({});
      setMsg('已清除');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '清除失败');
    } finally {
      setSaving(false);
    }
  }

  const frequency = Object.entries(DIM_LABELS)
    .map(([dim, label]) => ({ label, values: topValues(prefs[dim]) }))
    .filter((item) => item.values.length > 0);

  const fieldCls = 'w-full rounded-lg border-slate-200 text-sm';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-800 mb-2">我的偏好</h2>
      <p className="text-sm text-slate-500 mb-4">
        这里设置的默认仅影响你自己的查询消歧与展示，不影响其他人；本轮对话明确指定时仍以本轮为准。
      </p>
      {loading ? (
        <p className="text-sm text-slate-400">加载中...</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm text-slate-500 mb-1">默认范围</span>
              <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="如：直营店" className={`${fieldCls} px-3 py-2`} />
            </label>
            <label className="block">
              <span className="block text-sm text-slate-500 mb-1">默认粒度</span>
              <Select
                value={granularity}
                onChange={setGranularity}
                className={fieldCls}
                options={[
                  { value: '', label: '不设置' },
                  { value: '月度', label: '月度' },
                  { value: '日度', label: '日度' },
                ]}
              />
            </label>
            <label className="block">
              <span className="block text-sm text-slate-500 mb-1">默认下载格式</span>
              <Select
                value={downloadFormat}
                onChange={setDownloadFormat}
                className={fieldCls}
                options={[
                  { value: '', label: '不设置' },
                  { value: 'xlsx', label: 'Excel (xlsx)' },
                  { value: 'csv', label: 'CSV' },
                ]}
              />
            </label>
            <label className="block">
              <span className="block text-sm text-slate-500 mb-1">回答详细度</span>
              <Select
                value={answerLevel}
                onChange={setAnswerLevel}
                className={fieldCls}
                options={[
                  { value: '', label: '不设置' },
                  { value: 'concise', label: '简洁' },
                  { value: 'detailed', label: '详细' },
                ]}
              />
            </label>
          </div>
          {frequency.length > 0 && (
            <div className="text-xs text-slate-500">
              <span className="text-slate-400">系统观察到的常用项：</span>
              {frequency.map((item) => `${item.label}：${item.values.join('、')}`).join('；')}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              autoInsertSpace={false}
              type="primary"
              onClick={handleSave}
              disabled={saving}
              className="h-auto rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? '处理中...' : '保存偏好'}
            </Button>
            <Button
              autoInsertSpace={false}
              onClick={handleClear}
              disabled={saving}
              className="h-auto rounded-lg border border-red-200 bg-red-50 px-6 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              清除全部偏好
            </Button>
            {msg && <span className="text-sm text-slate-500">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
