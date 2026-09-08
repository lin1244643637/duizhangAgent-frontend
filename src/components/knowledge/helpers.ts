/** KnowledgeBasePage 的共享常量与纯函数（从主页面机械拆出，行为不变）。 */

import { formatBeijingTime } from '../../utils/time';

export const CATEGORY_LABEL: Record<string, string> = {
  general: '通用',
  reconcile: '对账',
  perf: '绩效',
  product: '产品',
  sop: 'SOP',
  process: '流程',
  report: '报表',
  finance_process: '财务流程',
  finance_scope: '财务范围',
  finance_mapping: '回款映射',
  report_template: '报表模板',
  report_instruction: '报表说明',
  hr_scope: '人事范围',
  hr_directory: '员工通讯录',
  hr_attendance_record: '考勤记录',
  hr_approval_record: '审批记录',
  hr_sync_result: '人事同步结果',
  hr_attendance_rule: '考勤规则',
  hr_approval_mapping: '审批映射',
  connector_query_knowledge: '数据字段说明',
  knowledge_module: '知识栏目',
};

export type KnowledgeModule = {
  id: string;
  label: string;
  description: string;
  categories: string[];
  categoryLabels?: Record<string, string>;
  accent: string;
  custom?: boolean;
};

export const BUILTIN_MODULES: KnowledgeModule[] = [
  {
    id: 'general',
    label: '通用',
    description: '跨智能体共用的基础知识',
    categories: ['general'],
    accent: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  {
    id: 'finance',
    label: '财务',
    description: '对账、账单模板、报表模板、回款映射',
    categories: ['reconcile', 'report', 'finance_process', 'finance_scope', 'finance_mapping', 'report_template', 'report_instruction'],
    accent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    id: 'hr',
    label: '人事',
    description: '钉钉人事、考勤规则、审批映射',
    categories: ['perf', 'hr_scope', 'hr_directory', 'hr_attendance_record', 'hr_approval_record', 'hr_sync_result', 'hr_attendance_rule', 'hr_approval_mapping'],
    accent: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    id: 'connector',
    label: '连接器配置',
    description: '企业连接器、数据字段说明和查询口径',
    categories: ['connector_query_knowledge'],
    accent: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  {
    id: 'product',
    label: '产品',
    description: '产品、SOP、流程和使用规范',
    categories: ['product', 'sop', 'process'],
    accent: 'bg-blue-50 text-blue-700 border-blue-200',
  },
];

export const CUSTOM_MODULES_KEY = 'duizhangAgent.knowledge.customModules';

export function normalizeModuleId(label: string): string {
  const slug = label.trim().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '');
  return `module_${slug || Date.now()}`;
}

export function normalizeCategoryId(moduleId: string, label: string): string {
  const slug = label.trim().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '');
  return `${moduleId}_${slug || Date.now()}`;
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category;
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: '手动录入',
  extracted: '对话沉淀',
  imported: '批量导入',
};

export function isLongKnowledgeContent(content: string): boolean {
  return content.split(/\r?\n/).length > 3 || content.length > 180;
}

export function formatTime(iso: string): string {
  if (!iso) return '';
  return formatBeijingTime(iso, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(/\//g, '-');
}
