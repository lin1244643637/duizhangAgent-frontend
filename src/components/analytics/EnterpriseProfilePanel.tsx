import { useEffect, useRef, useState } from 'react';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Button, DatePicker, Form, Input, Table, notification, type TableColumnsType } from 'antd';
import { getEnterpriseProfile, getEnterpriseProfileHistory, saveEnterpriseProfile } from '../../api/analyticsDecision';
import type { EnterpriseProfile, EnterpriseProfileInput } from '../../types/analyticsDecision';
import { currentBeijingDate } from '../../utils/time';
import { inputCls } from './shared';

type ArrayField = 'core_customers' | 'core_products' | 'operating_constraints' | 'review_red_lines';

const initialDraft = (): EnterpriseProfileInput => ({
  effective_from: currentBeijingDate(),
  scope: { type: 'company', key: 'ALL' },
  brand_positioning: '',
  core_customers: [],
  price_band: '',
  core_products: [],
  operating_constraints: [],
  review_red_lines: [],
});

function noticeOptions(message: string, description: string) {
  return { message, description, duration: 5, closable: true };
}

function profileDraft(profile: EnterpriseProfile): EnterpriseProfileInput {
  const { id: _id, profile_version: _version, status: _status, created_by: _createdBy, created_at: _createdAt, updated_at: _updatedAt, ...draft } = profile;
  return draft;
}

function ArrayEditor({
  label,
  field,
  values,
  onChange,
}: {
  label: string;
  field: ArrayField;
  values: string[];
  onChange: (field: ArrayField, values: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{label}</span>
        <Button
          type="text"
          size="small"
          icon={<PlusOutlined />}
          aria-label={`新增${label}`}
          onClick={() => onChange(field, [...values, ''])}
        />
      </div>
      {values.length === 0 ? <span className="text-xs text-slate-400">暂无</span> : values.map((value, index) => (
        <div key={`${field}-${index}`} className="flex items-center gap-1">
          <Input
            aria-label={`${label} ${index + 1}`}
            className={inputCls}
            value={value}
            onChange={(event) => onChange(field, values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`删除${label} ${index + 1}`}
            onClick={() => onChange(field, values.filter((_, itemIndex) => itemIndex !== index))}
          />
        </div>
      ))}
    </div>
  );
}

export function EnterpriseProfilePanel() {
  const [notice, noticeHolder] = notification.useNotification();
  const mounted = useRef(false);
  const [current, setCurrent] = useState<EnterpriseProfile | null>(null);
  const [history, setHistory] = useState<EnterpriseProfile[]>([]);
  const [draft, setDraft] = useState<EnterpriseProfileInput>(initialDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mounted.current = true;
    Promise.all([getEnterpriseProfile(), getEnterpriseProfileHistory()])
      .then(([profile, versions]) => {
        if (!mounted.current) return;
        setCurrent(profile);
        setHistory(versions);
        if (profile) setDraft(profileDraft(profile));
      })
      .catch((error) => {
        if (mounted.current) notice.error(noticeOptions('加载企业画像失败', (error as Error).message));
      })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [notice]);

  const updateArray = (field: ArrayField, values: string[]) => {
    setDraft((previous) => ({ ...previous, [field]: values }));
  };

  const onSave = async () => {
    if (!draft.brand_positioning.trim()) return;
    setSaving(true);
    try {
      const saved = await saveEnterpriseProfile({
        ...draft,
        brand_positioning: draft.brand_positioning.trim(),
        price_band: draft.price_band.trim(),
        scope: { type: 'company', key: 'ALL' },
        core_customers: draft.core_customers.map((item) => item.trim()).filter(Boolean),
        core_products: draft.core_products.map((item) => item.trim()).filter(Boolean),
        operating_constraints: draft.operating_constraints.map((item) => item.trim()).filter(Boolean),
        review_red_lines: draft.review_red_lines.map((item) => item.trim()).filter(Boolean),
      });
      if (!mounted.current) return;
      setCurrent(saved);
      setDraft(profileDraft(saved));
      notice.success(noticeOptions('企业画像已保存', `当前版本 v${saved.profile_version}`));
      try {
        const versions = await getEnterpriseProfileHistory();
        if (mounted.current) setHistory(versions);
      } catch (error) {
        if (mounted.current) notice.error(noticeOptions('刷新画像历史失败', (error as Error).message));
      }
    } catch (error) {
      if (!mounted.current) return;
      const status = (error as { status?: number }).status;
      const sessionExpired = error instanceof Error && error.message === '登录已过期，请重新登录';
      if (status === 401 || status === 403 || sessionExpired) {
        notice.error(noticeOptions('无权限保存', '仅管理员可修改企业画像。'));
      } else {
        notice.error(noticeOptions('保存企业画像失败', (error as Error).message));
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const columns: TableColumnsType<EnterpriseProfile> = [
    { title: '版本', dataIndex: 'profile_version', width: 72, render: (value) => `v${value}` },
    { title: '状态', dataIndex: 'status', width: 84, render: (value) => value === 'active' ? '当前' : '已替代' },
    { title: '生效日', dataIndex: 'effective_from', width: 112 },
    { title: '定位', dataIndex: 'brand_positioning', ellipsis: true },
  ];

  return (
    <div className="space-y-4 pt-1">
      {noticeHolder}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{current ? `当前版本 v${current.profile_version}` : '尚未配置企业画像'}</span>
        <span>{current ? `生效日 ${current.effective_from}` : '保存后参与经营预测、报告和次日决策'}</span>
      </div>
      <Form component={false}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Form.Item label="生效日" className="mb-0">
            <DatePicker
              aria-label="企业画像生效日"
              value={dayjs(draft.effective_from)}
              maxDate={dayjs(currentBeijingDate())}
              allowClear={false}
              format="YYYY-MM-DD"
              onChange={(value) => setDraft((previous) => ({ ...previous, effective_from: value?.format('YYYY-MM-DD') || '' }))}
            />
          </Form.Item>
          <div className="flex items-end pb-1 text-xs text-slate-500 md:col-span-2">适用范围：全公司</div>
          <Form.Item label="品牌与市场定位" className="mb-0 md:col-span-2">
            <Input.TextArea aria-label="品牌与市场定位" rows={3} value={draft.brand_positioning} onChange={(event) => setDraft((previous) => ({ ...previous, brand_positioning: event.target.value }))} />
          </Form.Item>
          <Form.Item label="价格带" className="mb-0">
            <Input aria-label="价格带" className={inputCls} value={draft.price_band} onChange={(event) => setDraft((previous) => ({ ...previous, price_band: event.target.value }))} />
          </Form.Item>
        </div>
      </Form>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ArrayEditor label="核心客群" field="core_customers" values={draft.core_customers} onChange={updateArray} />
        <ArrayEditor label="核心产品" field="core_products" values={draft.core_products} onChange={updateArray} />
        <ArrayEditor label="经营约束" field="operating_constraints" values={draft.operating_constraints} onChange={updateArray} />
        <ArrayEditor label="评价红线" field="review_red_lines" values={draft.review_red_lines} onChange={updateArray} />
      </div>
      <div className="flex justify-end">
        <Button type="primary" loading={saving} disabled={loading || !draft.brand_positioning.trim()} onClick={onSave}>保存企业画像</Button>
      </div>
      <Table<EnterpriseProfile>
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        columns={columns}
        dataSource={history}
        locale={{ emptyText: '暂无企业画像历史' }}
      />
    </div>
  );
}
