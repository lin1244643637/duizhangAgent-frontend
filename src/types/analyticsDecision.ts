export type ProfitLine = {
  id: string;
  store_key: string;
  effective_date: string;
  net_income_line: string;
  enabled: boolean;
  reason: string;
  created_by: string | null;
  created_at: string | null;
};

export type ProfitLineVersions = {
  current: ProfitLine | null;
  next: ProfitLine | null;
  versions: ProfitLine[];
};

export type ProfitLineInput = Pick<ProfitLine, 'store_key' | 'effective_date' | 'net_income_line' | 'enabled' | 'reason'>;

export type StaffingRule = {
  id: string;
  store_key: string;
  meal_period: string;
  role_code: string;
  role_name: string | null;
  minimum_headcount: number;
  allocation_weight: string | null;
  target_revenue_per_labor_hour: string | null;
  orders_per_labor_hour: string | null;
  effective_date: string;
  enabled: boolean;
  created_by: string | null;
  created_at: string | null;
};

export type StaffingRuleVersions = {
  current: StaffingRule[];
  versions: StaffingRule[];
};

export type StaffingRuleInput = Omit<StaffingRule, 'id' | 'created_by' | 'created_at'>;

export type EnterpriseProfileScope = {
  type: 'company';
  key: 'ALL';
};

export type EnterpriseProfileInput = {
  effective_from: string;
  scope: EnterpriseProfileScope;
  brand_positioning: string;
  core_customers: string[];
  price_band: string;
  core_products: string[];
  operating_constraints: string[];
  review_red_lines: string[];
};

export type EnterpriseProfile = EnterpriseProfileInput & {
  id: string;
  profile_version: number;
  status: 'active' | 'superseded';
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};
