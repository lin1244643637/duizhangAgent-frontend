export type DailyFactCacheStatus = 'hit' | 'miss' | 'partial' | 'bypass' | 'error';

export type AnalyticsClientDayVersion = {
  date: string;
  version: string;
};

export type DailyFactDeltaRequest = {
  schema_version?: string | null;
  date_from: string;
  date_to: string;
  params?: Record<string, unknown>;
  client_access_scope_hash?: string | null;
  client_days?: AnalyticsClientDayVersion[];
  force_refresh?: boolean;
};

export type DailyFactChangedDay<T = Record<string, unknown>> = {
  date: string;
  version: string;
  payload: T;
  completeness?: Record<string, unknown>;
};

export type DailyFactCacheMeta = {
  status: DailyFactCacheStatus;
  server_checked_days: number;
  returned_days: number;
  deleted_days: number;
  redis_hit_days?: number;
  postgres_fallback_days?: number;
  redis_write_days?: number;
  redis_write_error_days?: number;
};

export type DailyFactDeltaResponse<T = Record<string, unknown>> = {
  namespace: string;
  schema_version: string;
  date_from: string;
  date_to: string;
  params_hash: string;
  access_scope_hash: string;
  reset_required: boolean;
  unchanged_days: string[];
  changed_days: DailyFactChangedDay<T>[];
  deleted_days: string[];
  cache_meta: DailyFactCacheMeta;
};

export type DailyFactRecord<T = Record<string, unknown>> = {
  tenantId: string;
  userId: string;
  accessScopeHash: string;
  namespace: string;
  schemaVersion: string;
  paramsHash: string;
  date: string;
  version: string;
  payload: T;
  completeness?: Record<string, unknown>;
  savedAt: string;
  lastAccessedAt: string;
};

export type DailyFactManifest = {
  tenantId: string;
  userId: string;
  accessScopeHash: string;
  namespace: string;
  schemaVersion: string;
  paramsHash: string;
  dateFrom: string;
  dateTo: string;
  updatedAt: string;
};

export type OrderFactTotals = {
  order_count: number;
  paid_amount_cent: number;
  income_amount_cent: number;
  refund_amount_cent: number;
  net_amount_cent: number;
  net_income_cent: number;
  completed_days?: number;
  expected_days?: number;
};

export type OrderStoreDailyFact = OrderFactTotals & {
  store_key: string;
  store_label?: string | null;
  source_totals?: Record<string, OrderFactTotals>;
  platform_totals?: Record<string, OrderFactTotals>;
};

export type OrderDailyFact = OrderFactTotals & {
  date: string;
  complete?: boolean;
  data_status?: string;
  excluded?: {
    excluded_orders: number;
    excluded_shops: { shop_id: string; shop_name: string }[];
    confirmed_shops: number;
  };
  stores: Record<string, OrderStoreDailyFact>;
  source_totals?: Record<string, OrderFactTotals>;
  platform_totals?: Record<string, OrderFactTotals>;
};
