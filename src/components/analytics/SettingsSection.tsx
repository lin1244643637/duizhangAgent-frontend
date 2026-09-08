import { useEffect, useState } from 'react';
import { Button, Collapse, Drawer, Input, InputNumber, Modal, Select, Table, type TableColumnsType } from 'antd';
import {
  confirmGeoProfile, confirmShopMapping, geocodeStore, getRevenueForecastModel, getStoreWeather, getTradeArea,
  listHrDepartments, listPlatformDim, listStoreGeoProfiles, listTradeAreaPois, listShopMappings, optimizeRevenueForecastModel,
  proposeShopMappings, refreshTradeArea, savePlatformName, saveStoreFacilityProfile, type GeocodeResult, type HrDept, type PlatformDim,
  type RevenueForecastModel, type ShopMapping, type StoreGeoProfile, type TradeAreaPoiItem, type TradeAreaSnapshot, type WeatherPeriod,
} from '../../api/analytics';
import { formatBeijingTime } from '../../utils/time';
import { DecisionSettingsPanel } from './DecisionSettingsPanel';
import {
  Card, FORECAST_ASSET_LABELS, inputCls, pct, searchableSelectProps, ymd,
} from './shared';

function scoreBar(label: string, score: number, maxScore = 100, tone: 'positive' | 'negative' = 'positive', hint?: string) {
  const filled = Math.round(score / maxScore * 5);
  const activeClass = tone === 'negative'
    ? (filled >= 4 ? 'bg-red-500' : filled >= 3 ? 'bg-amber-400' : 'bg-emerald-500')
    : (filled >= 4 ? 'bg-emerald-500' : filled >= 3 ? 'bg-amber-400' : 'bg-slate-300');
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="w-16 text-slate-500 text-right">{label}</span>
      <span className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`w-2 h-2 rounded-full ${i < filled ? activeClass : 'bg-slate-200'}`} />
        ))}
      </span>
      <span className="text-slate-400 tabular-nums w-6">{score}</span>
      {hint && <span className="ml-auto text-[11px] text-slate-400 tabular-nums">{hint}</span>}
    </div>
  );
}

function tagChip(label: string) {
  return <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">{label}</span>;
}

const BUCKET_CN: Record<string, string> = {
  residential: '住宅', office: '办公', school: '学校',
  hospital: '医疗', mall: '商业', transport: '交通',
  hotel: '酒店', scenic: '景区',
  food_competitor: '餐饮竞争', same_category_competitor: '直接竞品',
};
function bucketLabel(key: string): string { return BUCKET_CN[key] || key; }

type FacilityDraft = Partial<Pick<StoreGeoProfile, 'store_area_m2' | 'kitchen_area_m2' | 'dining_table_count' | 'seat_count' | 'facility_note'>>;

function tradeMetricHint(tradeData: TradeAreaSnapshot | null, key: string) {
  const metric = tradeData?.density_metrics?.[key];
  if (!metric) return undefined;
  return `有效 ${metric.effective_count}/${metric.reference_count}`;
}

function StoreGeoPanel({ show }: { show: (m: string) => void }) {
  const [profiles, setProfiles] = useState<StoreGeoProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalShopId, setModalShopId] = useState<string | null>(null);
  const [modalShopName, setModalShopName] = useState('');
  const [address, setAddress] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [geoResult, setGeoResult] = useState<GeocodeResult | null>(null);
  const [detailStoreKey, setDetailStoreKey] = useState<string | null>(null);
  const [tradeData, setTradeData] = useState<TradeAreaSnapshot | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [poiList, setPoiList] = useState<TradeAreaPoiItem[] | null>(null);
  const [poiLoading, setPoiLoading] = useState(false);
  const [poiBucket, setPoiBucket] = useState('');
  const [weather, setWeather] = useState<WeatherPeriod | null>(null);
  const [facilityDrafts, setFacilityDrafts] = useState<Record<string, FacilityDraft>>({});
  const [savingFacilityId, setSavingFacilityId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    listStoreGeoProfiles({ mappedOnly: true })
      .then(setProfiles)
      .catch(e => show('加载门店地理失败: ' + (e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openModal = (p: StoreGeoProfile) => {
    setModalShopId(p.store_key || p.shop_id);
    setModalShopName(p.shop_name);
    setAddress(p.source_address || '');
    setGeoResult(null);
  };

  const openDetail = async (storeKey: string) => {
    setDetailStoreKey(storeKey);
    setTradeData(null);
    setTradeLoading(true);
    try {
      const data = await getTradeArea(storeKey);
      setTradeData(data);
    } catch {
      setTradeData(null);
    } finally {
      setTradeLoading(false);
    }
    setWeather(null);
    // 今日天气
    getStoreWeather(storeKey, 'day', ymd(new Date())).then(setWeather).catch(() => setWeather(null));
  };

  const onRefreshTrade = async () => {
    if (!detailStoreKey) return;
    setTradeLoading(true);
    try {
      const res = await refreshTradeArea(detailStoreKey);
      if (res.snapshot) {
        setTradeData({ ...res.snapshot, computed_at: null });
        show('商圈已刷新');
      } else {
        show(res.message || (res.refresh_queued ? '商圈刷新任务已投递' : '商圈刷新未投递'));
      }
    } catch (e) {
      show('商圈刷新失败: ' + (e as Error).message);
    } finally {
      setTradeLoading(false);
    }
  };

  const loadPois = async (bucket?: string) => {
    if (!detailStoreKey) return;
    setPoiLoading(true);
    setPoiList(null);
    try {
      const items = await listTradeAreaPois(detailStoreKey, bucket || undefined);
      setPoiList(items);
    } catch {
      setPoiList([]);
    } finally {
      setPoiLoading(false);
    }
  };

  const onGeocode = async () => {
    if (!address.trim() || modalShopId === null) return;
    setGeocoding(true);
    setGeoResult(null);
    try {
      const r = await geocodeStore(String(modalShopId), address.trim());
      setGeoResult(r);
    } catch (e) {
      show('地址解析失败: ' + (e as Error).message);
    } finally {
      setGeocoding(false);
    }
  };

  const onConfirm = async () => {
    if (modalShopId === null) return;
    try {
      await confirmGeoProfile(String(modalShopId));
      show('门店坐标已确认');
      setModalShopId(null);
      setGeoResult(null);
      load();
    } catch (e) {
      show('确认失败: ' + (e as Error).message);
    }
  };

  const facilityValue = <K extends keyof FacilityDraft>(p: StoreGeoProfile, key: K): FacilityDraft[K] => (
    facilityDrafts[p.shop_id]?.[key] ?? p[key]
  ) as FacilityDraft[K];

  const setFacilityValue = <K extends keyof FacilityDraft>(shopId: string, key: K, value: FacilityDraft[K]) => {
    setFacilityDrafts(d => ({ ...d, [shopId]: { ...(d[shopId] || {}), [key]: value } }));
  };

  const onSaveFacility = async (p: StoreGeoProfile) => {
    setSavingFacilityId(p.shop_id);
    try {
      const saved = await saveStoreFacilityProfile(String(p.store_key || p.shop_id), {
        store_area_m2: Number(facilityValue(p, 'store_area_m2') || 0) || null,
        kitchen_area_m2: Number(facilityValue(p, 'kitchen_area_m2') || 0) || null,
        dining_table_count: Number(facilityValue(p, 'dining_table_count') || 0) || null,
        seat_count: Number(facilityValue(p, 'seat_count') || 0) || null,
        facility_note: String(facilityValue(p, 'facility_note') || '').trim() || null,
      });
      setProfiles(items => items.map(item => item.shop_id === p.shop_id ? { ...item, ...saved } : item));
      setFacilityDrafts(d => {
        const next = { ...d };
        delete next[p.shop_id];
        return next;
      });
      show('门店基础档案已保存');
    } catch (e) {
      show('保存门店档案失败: ' + (e as Error).message);
    } finally {
      setSavingFacilityId(null);
    }
  };

  const statusDot = (s: string) => {
    const colors: Record<string, string> = { confirmed: 'bg-green-500', draft: 'bg-yellow-500', unresolved: 'bg-slate-300', failed: 'bg-red-500' };
    return <span className={'inline-block w-2 h-2 rounded-full ' + (colors[s] || 'bg-slate-300')} />;
  };

  const statusLabel = (s: string) => {
    const labels: Record<string, string> = { confirmed: '已确认', draft: '待确认', unresolved: '未解析', failed: '失败' };
    return labels[s] || s;
  };

  const geoColumns: TableColumnsType<StoreGeoProfile> = [
    { title: '门店 ID', dataIndex: 'shop_id', key: 'shop_id', render: (value) => <span className="text-slate-500">{String(value)}</span> },
    { title: '店名', dataIndex: 'shop_name', key: 'shop_name', render: (value) => <span className="text-slate-700">{String(value || '-')}</span> },
    {
      title: '店面㎡',
      key: 'store_area_m2',
      width: 96,
      render: (_, p) => (
        <InputNumber
          min={0}
          precision={1}
          className="w-20"
          value={facilityValue(p, 'store_area_m2') as number | null}
          onChange={(value) => setFacilityValue(p.shop_id, 'store_area_m2', value)}
        />
      ),
    },
    {
      title: '后厨㎡',
      key: 'kitchen_area_m2',
      width: 96,
      render: (_, p) => (
        <InputNumber
          min={0}
          precision={1}
          className="w-20"
          value={facilityValue(p, 'kitchen_area_m2') as number | null}
          onChange={(value) => setFacilityValue(p.shop_id, 'kitchen_area_m2', value)}
        />
      ),
    },
    {
      title: '桌/椅',
      key: 'tables_seats',
      width: 140,
      render: (_, p) => (
        <div className="flex items-center gap-1">
          <InputNumber
            min={0}
            precision={0}
            className="w-14"
            value={facilityValue(p, 'dining_table_count') as number | null}
            onChange={(value) => setFacilityValue(p.shop_id, 'dining_table_count', value)}
          />
          <span className="text-slate-300">/</span>
          <InputNumber
            min={0}
            precision={0}
            className="w-14"
            value={facilityValue(p, 'seat_count') as number | null}
            onChange={(value) => setFacilityValue(p.shop_id, 'seat_count', value)}
          />
        </div>
      ),
    },
    {
      title: '档案备注',
      key: 'facility_note',
      width: 140,
      render: (_, p) => (
        <Input
          className="w-32"
          value={String(facilityValue(p, 'facility_note') || '')}
          onChange={e => setFacilityValue(p.shop_id, 'facility_note', e.target.value)}
          placeholder="合同/口径"
        />
      ),
    },
    {
      title: '地址',
      key: 'address',
      render: (_, p) => (
        <span className="block max-w-[200px] truncate text-slate-500" title={p.source_address || p.normalized_address || ''}>
          {p.source_address || p.normalized_address || '—'}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value) => (
        <span className="flex items-center gap-1">
          {statusDot(String(value))}
          <span className="text-xs text-slate-500">{statusLabel(String(value))}</span>
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      align: 'right',
      render: (_, p) => (
        <span className="flex items-center justify-end gap-2">
          <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer"
            onClick={() => openModal(p)}>
            {p.status === 'confirmed' ? '编辑' : '解析'}
          </Button>
          {p.status === 'confirmed' && (
            <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer" onClick={() => openDetail(String(p.store_key || p.shop_id))} aria-label="查看门店详情">
              详情
            </Button>
          )}
          <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer disabled:opacity-50"
            disabled={savingFacilityId === p.shop_id} onClick={() => onSaveFacility(p)}>
            {savingFacilityId === p.shop_id ? '保存中' : '保存档案'}
          </Button>
        </span>
      ),
    },
  ];
  const poiColumns: TableColumnsType<TradeAreaPoiItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (value) => <span className="block max-w-[200px] truncate text-slate-600" title={String(value || '')}>{String(value || '-')}</span>,
    },
    { title: '分类', dataIndex: 'bucket', key: 'bucket', width: 64, render: (value) => <span className="text-[11px] text-slate-400">{bucketLabel(String(value))}</span> },
    { title: '距离', dataIndex: 'distance_m', key: 'distance_m', width: 48, align: 'right', render: (value) => <span className="tabular-nums text-slate-500">{String(value)}m</span> },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-slate-700 mb-1">📍 门店地理</h3>
          <p className="text-xs text-slate-400">
            已确认 {profiles.filter(p => p.status === 'confirmed').length} 家，待确认 {profiles.filter(p => p.status === 'draft').length} 家
          </p>
        </div>
	        <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer disabled:opacity-50" disabled={loading} onClick={load}>
	          {loading ? '加载中…' : '刷新'}
	        </Button>
      </div>

      {profiles.length === 0
        ? <div className="text-slate-400 text-sm">{loading ? '加载中…' : '暂无门店数据'}</div>
        : <div className="overflow-x-auto">
            <Table<StoreGeoProfile>
              columns={geoColumns}
              dataSource={profiles}
              pagination={false}
              rowKey="shop_id"
              size="small"
              scroll={{ x: 'max-content' }}
            />
          </div>
      }

      {/* 地址解析弹窗 */}
      {modalShopId !== null && (
        <Modal
          open
          footer={null}
          closable={false}
          width="32rem"
          onCancel={() => { setModalShopId(null); setGeoResult(null); }}
          styles={{ body: { padding: 0 } }}
        >
          <div className="max-h-[80vh] overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-slate-700">📍 地址解析 — {modalShopName}</h4>
	                <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-slate-400 shadow-none hover:text-slate-600 text-lg cursor-pointer" aria-label="关闭"
	                  onClick={() => { setModalShopId(null); setGeoResult(null); }}>✕</Button>
              </div>

              <label className="text-xs text-slate-500 mb-1 block">门店地址</label>
	              <Input className="w-full border border-slate-200 rounded px-3 py-2 text-sm mb-3"
	                value={address} onChange={e => setAddress(e.target.value)}
	                placeholder="例：陕西省西安市未央区凤城八路" />

	              <Button autoInsertSpace={false} htmlType="button" className="h-auto w-full bg-blue-600 text-white text-sm rounded py-2 hover:bg-blue-700 disabled:opacity-50 cursor-pointer mb-4"
	                disabled={!address.trim() || geocoding} onClick={onGeocode}>
	                {geocoding ? '解析中…' : '地址解析'}
	              </Button>

              {geoResult && (
                <div className="space-y-3">
                  {geoResult.candidates.length > 0 && (
                    <div>
                      <div className="text-xs text-slate-500 mb-1">候选门店（高德 POI 搜索）</div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {geoResult.candidates.map((c, i) => (
                          <div key={c.id || i} className="text-xs border rounded px-3 py-2">
                            <div className="text-slate-700 font-medium">{c.name}</div>
                            <div className="text-slate-400">{c.address} · 评分 {c.rating} · 人均 ¥{c.cost}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs text-slate-500 mb-1">解析结果</div>
                    <div className="bg-slate-50 rounded px-3 py-2 space-y-1 text-xs text-slate-600">
                      <div>地址: {geoResult.address}</div>
                      {geoResult.longitude && <div>经纬度: {geoResult.longitude}, {geoResult.latitude}</div>}
                      {geoResult.city && <div>行政区: {geoResult.province} · {geoResult.city} · {geoResult.district}</div>}
                      {geoResult.business_areas && Array.isArray(geoResult.business_areas) && geoResult.business_areas.length > 0 && (
                        <div>商圈: {geoResult.business_areas.map((b: unknown) => typeof b === 'object' && b ? ((b as Record<string, unknown>).name || JSON.stringify(b)) : b).join(' / ')}</div>
                      )}
                      <div>高德置信度: {geoResult.confidence}</div>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
	                    <Button autoInsertSpace={false} htmlType="button" className="h-auto text-sm text-slate-500 px-4 py-1.5 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer"
	                      onClick={() => { setModalShopId(null); setGeoResult(null); }}>
	                      取消
	                    </Button>
	                    <Button autoInsertSpace={false} htmlType="button" className="h-auto text-sm bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 cursor-pointer"
	                      onClick={onConfirm}>
	                      确认坐标
	                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* 门店详情抽屉（商圈画像） */}
      {detailStoreKey !== null && (
        <Drawer
          open
          placement="right"
          size="32rem"
          closable={false}
          onClose={() => setDetailStoreKey(null)}
          styles={{ body: { padding: 0 } }}
        >
          <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-medium text-slate-800">
                    {(() => { const p = profiles.find(x => String(x.store_key || x.shop_id) === detailStoreKey); return p ? p.shop_name : detailStoreKey; })()}
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">门店详情</p>
                </div>
	                <Button autoInsertSpace={false} htmlType="button" className="h-auto rounded-md border-0 px-2 py-1 text-sm text-slate-400 shadow-none hover:bg-slate-100 hover:text-slate-600 cursor-pointer" onClick={() => setDetailStoreKey(null)} aria-label="关闭">
	                  关闭
	                </Button>
              </div>

              {/* 基础信息 */}
              {(() => {
                const p = profiles.find(x => String(x.store_key || x.shop_id) === detailStoreKey);
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs text-slate-500 space-y-1">
                    {p.normalized_address && <div>地址: {p.normalized_address}</div>}
                    {p.longitude && <div>经纬度: {p.longitude}, {p.latitude}</div>}
                    {p.city && <div>行政区: {p.province} · {p.city} · {p.district}</div>}
                    {(p.store_area_m2 || p.kitchen_area_m2 || p.dining_table_count || p.seat_count) && (
                      <div>门店档案: 店面 {p.store_area_m2 || '—'}㎡ · 后厨 {p.kitchen_area_m2 || '—'}㎡ · 桌 {p.dining_table_count || '—'} · 餐位 {p.seat_count || '—'}</div>
                    )}
                    {p.facility_note && <div>备注: {p.facility_note}</div>}
                    <div>坐标: ✅ 已确认</div>
                  </div>
                );
              })()}

              {/* 天气摘要 */}
              <div className="rounded-lg border border-slate-200 p-3">
                <h5 className="text-sm font-medium text-slate-700 mb-2">天气摘要</h5>
                {weather ? (
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex flex-wrap gap-1">
                      {weather.bad_weather_tags?.map(t => <span key={t} className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{t}</span>)}
                      {!weather.bad_weather_tags?.length && <span className="text-slate-400">无恶劣天气</span>}
                    </div>
                    <div className="flex gap-4">
                      {weather.avg_temp != null && <span>均温 {weather.avg_temp.toFixed(1)}°C</span>}
                      {weather.max_temp != null && <span>最高 {weather.max_temp.toFixed(1)}°C</span>}
                      {weather.min_temp != null && <span>最低 {weather.min_temp.toFixed(1)}°C</span>}
                    </div>
                    {weather.rainy_hours > 0 && <span>降雨 {weather.rainy_hours}h</span>}
                    <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-50">
                      和风天气 · {weather.source === 'computed' ? '现场汇总' : '快照'}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">暂无天气数据</div>
                )}
              </div>

              {/* 3km 商圈画像 */}
              <div className="rounded-lg border border-slate-200 p-4">
                <h5 className="text-sm font-medium text-slate-700 mb-3">3km 商圈画像</h5>

                {tradeLoading ? (
                  <div className="py-8 text-center text-sm text-slate-400">加载商圈数据中…</div>
                ) : tradeData ? (
                  <div className="space-y-3">
                    {/* 标签 */}
                    {tradeData.tags && tradeData.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">{tradeData.tags.map((t, i) => <span key={i}>{tagChip(t)}</span>)}</div>
                    )}

                    {/* 评分 */}
                    {tradeData.scores && (
                      <div className="space-y-1 bg-slate-50 rounded px-3 py-2">
                        {tradeData.scores.residential !== undefined && scoreBar('居住环境', tradeData.scores.residential, 100, 'positive', tradeMetricHint(tradeData, 'residential'))}
                        {tradeData.scores.office !== undefined && scoreBar('办公环境', tradeData.scores.office, 100, 'positive', tradeMetricHint(tradeData, 'office'))}
                        {tradeData.scores.competition !== undefined && scoreBar('餐饮竞争', tradeData.scores.competition, 100, 'negative', tradeMetricHint(tradeData, 'competition'))}
                        {tradeData.scores.transport !== undefined && scoreBar('交通便利', tradeData.scores.transport, 100, 'positive', tradeMetricHint(tradeData, 'transport'))}
                        {tradeData.scores.mall !== undefined && scoreBar('商业密度', tradeData.scores.mall, 100, 'positive', tradeMetricHint(tradeData, 'mall'))}
                        {tradeData.scores.school !== undefined && scoreBar('学校密度', tradeData.scores.school, 100, 'positive', tradeMetricHint(tradeData, 'school'))}
                        {tradeData.scores.hospital !== undefined && scoreBar('医疗密度', tradeData.scores.hospital, 100, 'positive', tradeMetricHint(tradeData, 'hospital'))}
                      </div>
                    )}

                    {/* 近距竞品 */}
                    {tradeData.top_competitors && tradeData.top_competitors.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-1">近距竞品（300m 内 Top 3）</div>
                        <div className="space-y-1">
                          {tradeData.top_competitors.map((c, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 rounded px-2 py-1">
                              <span className="font-medium text-slate-700 w-28 truncate">{c.name}</span>
                              <span className="text-amber-500">评分 {c.rating.toFixed(1)}</span>
                              <span className="text-slate-400">人均 ¥{c.cost}</span>
                              <span className="ml-auto text-slate-400">{c.distance_m}m</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* POI 分布 */}
                    {tradeData.poi_counts && Object.keys(tradeData.poi_counts).length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-1">POI 分布</div>
                        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
                          {Object.entries(tradeData.poi_counts).map(([k, v]) => (
                            <div key={k} className="text-xs text-slate-600 flex justify-between">
                              <span className="text-slate-400">{bucketLabel(k)}&nbsp;</span>
                              <span className="tabular-nums">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-slate-400 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span>高德 POI 3km 采样 · {tradeData.snapshot_month}</span>
                      <div className="flex items-center gap-3">
	                        <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer"
	                          onClick={() => loadPois()}>
	                          {poiList ? '收起 POI 明细' : '查看 POI 明细'}
	                        </Button>
	                        <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer disabled:opacity-50"
	                          disabled={tradeLoading} onClick={onRefreshTrade}>
	                          {tradeLoading ? '刷新中…' : '刷新商圈'}
	                        </Button>
                      </div>
                    </div>

                    {/* POI 明细列表 */}
                    {poiList && (
                      <div className="pt-2 border-t border-slate-100">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500">POI 明细</span>
		                          <Select
		                            {...searchableSelectProps}
		                            className="rounded border border-slate-200 text-xs text-slate-500"
	                            value={poiBucket}
	                            onChange={(value) => { setPoiBucket(value); loadPois(value || undefined); }}
	                            options={[
	                              { value: '', label: '全部分类' },
	                              ...Object.keys(tradeData.poi_counts || {}).map(k => ({ value: k, label: bucketLabel(k) })),
	                            ]}
	                            popupMatchSelectWidth={false}
	                          />
                          <span className="text-xs text-slate-400">{poiList.length} 条</span>
                        </div>
                        {poiLoading ? (
                          <div className="py-4 text-center text-xs text-slate-400">加载中…</div>
                        ) : (
                          <div className="max-h-64 overflow-y-auto space-y-0.5">
                            <Table<TradeAreaPoiItem>
                              columns={poiColumns}
                              dataSource={poiList}
                              pagination={false}
                              rowKey={(p, index) => `${p.name}-${p.distance_m}-${index}`}
                              size="small"
                              scroll={{ x: 'max-content' }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center space-y-2">
                    <div className="text-sm text-slate-400">暂无商圈数据</div>
	                    <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer"
	                      disabled={tradeLoading} onClick={onRefreshTrade}>
	                      生成商圈分析
	                    </Button>
                  </div>
                )}
              </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}


export function SettingsSection({ show }: { show: (m: string) => void }) {
  return (
    <div className="space-y-4">
      <ForecastModelPanel show={show} />
      <DecisionSettingsPanel />
      <StoreGeoPanel show={show} />
      <ShopMappingPanel show={show} />
      <PlatformPanel show={show} />
    </div>
  );
}

function ForecastModelPanel({ show }: { show: (m: string) => void }) {
  const [model, setModel] = useState<RevenueForecastModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  const load = () => {
    setLoading(true);
    getRevenueForecastModel()
      .then(setModel)
      .catch(e => show((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const onOptimize = () => {
    setOptimizing(true);
    optimizeRevenueForecastModel()
      .then(() => {
        show('已生成预测模型优化建议');
        load();
      })
      .catch(e => show((e as Error).message))
      .finally(() => setOptimizing(false));
  };

  const readiness = model?.readiness;
  const coverages = Object.entries(readiness?.feature_coverage || {})
    .filter(([, item]) => item.sample_count > 0)
    .sort((a, b) => b[1].sample_count - a[1].sample_count);
  const progress = readiness
    ? Math.min(1, (readiness.backfilled_sample_count || 0) / Math.max(1, readiness.min_backfilled_samples || 20))
    : 0;
  const healthText = !readiness
    ? '暂无状态'
    : readiness.status === 'ready_for_optimization'
    ? '可用，已达到优化门槛'
    : readiness.backfilled_sample_count > 0
    ? '可用，继续积累真实值'
    : '可试算，等待真实值回填';
  const healthTone = readiness?.status === 'ready_for_optimization'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : readiness?.backfilled_sample_count
    ? 'bg-blue-50 text-blue-700 border-blue-100'
    : 'bg-amber-50 text-amber-700 border-amber-100';
  const missingFeatureLabels = readiness
    ? Object.entries(readiness.available_feature_labels || {})
        .filter(([key]) => !readiness.feature_coverage?.[key]?.sample_count)
        .map(([, label]) => label)
    : [];
  const assetReadiness = model?.current_asset_readiness;
  const assetEntries = assetReadiness
    ? Object.entries(assetReadiness.assets || {}).sort(([a], [b]) => (FORECAST_ASSET_LABELS[a] || a).localeCompare(FORECAST_ASSET_LABELS[b] || b, 'zh-CN'))
    : [];

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-slate-700 mb-1">营业额预测模型</h3>
          <p className="text-xs text-slate-400">看模型现在能不能用于预测、还缺哪些数据资产、是否可以优化权重。</p>
        </div>
        <div className="flex gap-2">
	          <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer disabled:opacity-50" disabled={loading} onClick={load}>
	            {loading ? '刷新中…' : '刷新'}
	          </Button>
	          <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer disabled:opacity-50" disabled={optimizing} onClick={onOptimize}>
	            {optimizing ? '生成中…' : '生成优化建议'}
	          </Button>
        </div>
      </div>
      {!model ? (
        <div className="text-sm text-slate-400">{loading ? '加载中…' : '暂无模型状态'}</div>
      ) : (
        <div className="space-y-3">
          <div className={`rounded-lg border px-3 py-2 text-sm ${healthTone}`}>
            <div className="font-medium">{healthText}</div>
            <div className="mt-1 text-xs opacity-80">
              已有 {readiness?.sample_count ?? 0} 条预测样本，其中 {readiness?.backfilled_sample_count ?? 0} 条已回填真实结果。
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-400">真实值回填进度</div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-blue-500" style={{ width: pct(progress) }} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {readiness?.backfilled_sample_count ?? 0}/{readiness?.min_backfilled_samples ?? 20}，还差 {readiness?.remaining_backfilled_samples ?? 0} 条
              </div>
            </div>
            <ForecastMetric label="当前可用于" value="直营店营业额预测" />
            <ForecastMetric label="优化建议" value={readiness?.status === 'ready_for_optimization' ? '可以生成或应用' : '继续积累样本'} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-500">当前预测资产覆盖</div>
            {assetEntries.length === 0 ? (
              <div className="text-xs text-slate-400">暂无当前资产覆盖摘要。</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assetEntries.map(([key, asset]) => (
                  <span key={key} className={`rounded-full px-2 py-1 text-xs ${asset.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : asset.status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {FORECAST_ASSET_LABELS[key] || key} · {assetStatusLabel(asset.status)}
                    {typeof asset.covered_count === 'number' && typeof asset.expected_count === 'number' ? ` ${asset.covered_count}/${asset.expected_count}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-500">已覆盖特征</div>
            {coverages.length === 0 ? (
              <div className="text-xs text-slate-400">暂无已回填样本，特征覆盖率待积累。</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {coverages.map(([key, item]) => (
                  <span key={key} className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                    {item.feature_label} · {item.sample_count} · {pct(item.coverage)}
                  </span>
                ))}
              </div>
            )}
          </div>
          {missingFeatureLabels.length > 0 && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              待补充资产：{missingFeatureLabels.join('、')}。补齐后可提升预测解释和区间可信度。
            </div>
          )}
          <details className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <summary className="cursor-pointer select-none text-slate-600">技术详情</summary>
            <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              <div>版本：{model.version}</div>
              <div>状态：{readiness?.status || model.status}</div>
              <div>待回填：{readiness?.pending_sample_count ?? 0}</div>
              <div>更新时间：{model.updated_at ? formatBeijingTime(model.updated_at) : '—'}</div>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}

function assetStatusLabel(status?: string) {
  if (status === 'ready') return '可用';
  if (status === 'partial') return '部分';
  if (status === 'missing') return '缺失';
  if (status === 'planned') return '待积累';
  return status || '未知';
}

function ForecastMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-slate-700" title={value}>{value}</div>
    </div>
  );
}

function ShopMappingPanel({ show }: { show: (m: string) => void }) {
  const [maps, setMaps] = useState<ShopMapping[]>([]);
  const [depts, setDepts] = useState<HrDept[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingSearch, setPendingSearch] = useState('');

  useEffect(() => {
    listShopMappings().then(setMaps).catch(e => show((e as Error).message));
    listHrDepartments().then(setDepts).catch(() => {});
  }, []);

  const onConfirm = (shopId: string, candidate: string) => {
    const deptId = drafts[shopId] ?? candidate;
    if (!deptId) { show('请先选择 HR 门店'); return; }
    setBusy(true);
    confirmShopMapping(shopId, deptId).then(setMaps).then(() => show('已确认映射')).catch(e => show((e as Error).message)).finally(() => setBusy(false));
  };
  const onPropose = () => {
    setBusy(true);
    proposeShopMappings().then(setMaps).then(() => show('已同步食亨门店并重新生成候选')).catch(e => show((e as Error).message)).finally(() => setBusy(false));
  };

  const confirmedMaps = maps.filter(mapping => mapping.status === 'confirmed');
  const pendingMaps = maps.filter(mapping => mapping.status !== 'confirmed');
  const normalizedPendingSearch = pendingSearch.trim().toLocaleLowerCase();
  const filteredPendingMaps = normalizedPendingSearch
    ? pendingMaps.filter(mapping => [
      mapping.shiheng_shop_name,
      mapping.shiheng_shop_id,
      mapping.hr_department_name,
    ].some(value => value?.toLocaleLowerCase().includes(normalizedPendingSearch)))
    : pendingMaps;
  const departmentOptions = [
    { value: '', label: '选择 HR 门店…' },
    ...depts.map(dept => ({ value: dept.id, label: dept.name })),
  ];
  const columns = (confirmed: boolean): TableColumnsType<ShopMapping> => [
    {
      title: '食亨门店',
      key: 'shop',
      width: 280,
      ellipsis: true,
      render: (_, mapping) => mapping.shiheng_shop_name || mapping.shiheng_shop_id,
    },
    {
      title: '匹配状态',
      key: 'status',
      width: 110,
      render: (_, mapping) => confirmed
        ? <span className="text-xs text-emerald-600">已确认</span>
        : <span className="text-xs text-slate-500">候选 {(mapping.match_score * 100).toFixed(0)}%</span>,
    },
    {
      title: 'HR 门店',
      key: 'department',
      width: 220,
      render: (_, mapping) => (
        <Select
          {...searchableSelectProps}
          aria-label={`${mapping.shiheng_shop_name || mapping.shiheng_shop_id} HR 门店`}
          className={inputCls + ' w-full min-w-40'}
          value={drafts[mapping.shiheng_shop_id] ?? mapping.hr_department_id ?? ''}
          disabled={busy}
          onChange={(value) => setDrafts(current => ({ ...current, [mapping.shiheng_shop_id]: value }))}
          options={departmentOptions}
          popupMatchSelectWidth={false}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, mapping) => (
        <Button
          autoInsertSpace={false}
          htmlType="button"
          type="link"
          size="small"
          className="px-0"
          disabled={busy}
          onClick={() => onConfirm(mapping.shiheng_shop_id, mapping.hr_department_id || '')}
        >
          {confirmed ? '改绑' : '确认'}
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <div>
        <h3 className="font-medium text-slate-700">店铺映射（人效前置）</h3>
        <p className="text-xs text-slate-400 mt-0.5">系统按店名给候选，确认后用于人效；未确认的店在人效里进「未覆盖」。</p>
      </div>
      <div className="mt-4 space-y-5">
        <section aria-labelledby="confirmed-shop-mappings-title">
          <div className="mb-2 flex items-center gap-2">
            <h4 id="confirmed-shop-mappings-title" className="text-sm font-medium text-slate-700">已确认店铺</h4>
            <span className="text-xs text-slate-400">{confirmedMaps.length} 家</span>
          </div>
          <Table<ShopMapping>
            rowKey="shiheng_shop_id"
            size="small"
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: 690 }}
            locale={{ emptyText: '暂无已确认店铺' }}
            dataSource={confirmedMaps}
            columns={columns(true)}
          />
        </section>

        <section aria-labelledby="pending-shop-mappings-title" className="border-t border-slate-100 pt-4">
          <Collapse
            className="border-0 bg-transparent"
            items={[{
              key: 'pending-shop-mappings',
              label: (
                <div className="flex items-center gap-2">
                  <h4 id="pending-shop-mappings-title" className="text-sm font-medium text-slate-700">待确认店铺</h4>
                  <span className="text-xs text-slate-400">{pendingMaps.length} 家</span>
                </div>
              ),
              extra: (
                <Button
                  autoInsertSpace={false}
                  htmlType="button"
                  className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer disabled:opacity-50"
                  disabled={busy}
                  onClick={(event) => { event.stopPropagation(); onPropose(); }}
                >
                  重新生成候选
                </Button>
              ),
              children: (
                <div className="space-y-3 pt-1">
                  <Input
                    aria-label="搜索待确认店铺"
                    className={inputCls}
                    placeholder="搜索食亨门店、门店 ID 或 HR 候选"
                    value={pendingSearch}
                    onChange={(event) => setPendingSearch(event.target.value)}
                    allowClear
                  />
                  <Table<ShopMapping>
                    rowKey="shiheng_shop_id"
                    size="small"
                    pagination={false}
                    tableLayout="fixed"
                    scroll={{ x: 690 }}
                    locale={{ emptyText: normalizedPendingSearch ? '没有匹配的待确认店铺' : '暂无待确认店铺' }}
                    dataSource={filteredPendingMaps}
                    columns={columns(false)}
                  />
                </div>
              ),
            }]}
          />
        </section>
      </div>
    </Card>
  );
}

function PlatformPanel({ show }: { show: (m: string) => void }) {
  const [plats, setPlats] = useState<PlatformDim[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    listPlatformDim()
      .then(setPlats)
      .catch(e => show((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const onSave = (code: number) => {
    const name = (drafts[code] ?? '').trim();
    if (!name) return;
    savePlatformName(code, name).then(() => { show('已保存平台名'); load(); }).catch(e => show((e as Error).message));
  };

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-slate-700 mb-1">平台名</h3>
          <p className="text-xs text-slate-400">食亨平台编码 → 中文名。订单里出现过的平台会列在这里。</p>
        </div>
	        <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer disabled:opacity-50" disabled={loading} onClick={load}>
	          {loading ? '刷新中…' : '刷新'}
	        </Button>
      </div>
      {plats.length === 0 ? <div className="text-slate-400 text-sm">{loading ? '加载中…' : '暂无平台记录'}</div> : (
        <div className="space-y-2">
          {plats.map(p => (
            <div key={p.platform_code} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-slate-500">编码 {p.platform_code}</span>
	              <Input className={inputCls + ' flex-1'} defaultValue={p.platform_name}
	                onChange={e => setDrafts(d => ({ ...d, [p.platform_code]: e.target.value }))} />
	              <Button autoInsertSpace={false} htmlType="button" className="h-auto border-0 p-0 text-xs text-blue-600 shadow-none hover:underline cursor-pointer" onClick={() => onSave(p.platform_code)}>保存</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
