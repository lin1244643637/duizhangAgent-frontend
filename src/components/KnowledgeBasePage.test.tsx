/** KnowledgeBasePage 冒烟测试：拆分重构的行为护栏(渲染/分区/切栏目/弹窗)。 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ role: 'admin' }),
}));

vi.mock('./SalaryTemplatePanel', () => ({
  SalaryTemplatePanel: () => <div>工资表模板面板</div>,
}));

const kbApiMocks = vi.hoisted(() => ({
  createKbEntry: vi.fn(),
  deleteKbEntry: vi.fn(),
  listKbEntries: vi.fn(),
  updateKbEntry: vi.fn(),
}));

vi.mock('../api/kb', () => ({
  createKbEntry: kbApiMocks.createKbEntry,
  deleteKbEntry: kbApiMocks.deleteKbEntry,
  deleteGlobalReportInstruction: vi.fn(),
  deleteReportTemplate: vi.fn(),
  deleteReportTemplateInstruction: vi.fn(),
  deleteReconcileTemplate: vi.fn(),
  draftReconcileTemplateFromExcel: vi.fn(),
  importSeedReconcileTemplates: vi.fn(),
  getKnowledgeReadiness: vi.fn().mockResolvedValue({
    status: 'warning',
    satisfied: ['已配置平台模板'],
    blocking_items: [],
    warnings: [{ code: 'w1', title: '缺少平台简称说明', message: '建议补充', category: 'finance_mapping', blocking: false }],
  }),
  getReportTemplate: vi.fn(),
  listKbEntries: kbApiMocks.listKbEntries,
  listReportTemplates: vi.fn().mockResolvedValue([
    {
      id: 'tpl1', template_label: '营业收入回款表', original_filename: '回款表.xlsx', sheet_count: 9,
      updated_at: '2026-06-01T10:00:00+08:00', has_global_instruction: true,
      has_template_instruction: false, instruction_updated_at: null,
    },
  ]),
  listReconcileTemplates: vi.fn().mockResolvedValue([
    { id: 'rt1', provider: 'meituan', platform_name: '美团外卖', file_keywords: ['美团'], sheet_count: 1, field_count: 5 },
  ]),
  saveReconcileTemplate: vi.fn(),
  seedRevenueCollectionCarryforward: vi.fn(),
  updateKbEntry: kbApiMocks.updateKbEntry,
  uploadFinanceProcessDocx: vi.fn(),
  uploadGlobalReportInstruction: vi.fn(),
  uploadReportTemplate: vi.fn(),
  uploadReportTemplateInstruction: vi.fn(),
  updateGlobalReportInstruction: vi.fn(),
  updateReportTemplateInstruction: vi.fn(),
}));

import { KnowledgeBasePage } from './KnowledgeBasePage';

describe('KnowledgeBasePage 冒烟', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverMock });
    Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverMock });
  });

  beforeEach(() => {
    localStorage.clear();
    kbApiMocks.createKbEntry.mockReset();
    kbApiMocks.deleteKbEntry.mockReset();
    kbApiMocks.updateKbEntry.mockReset();
    kbApiMocks.listKbEntries.mockReset();
    kbApiMocks.listKbEntries.mockResolvedValue([
      {
        id: 'e1', title: '直营店范围', content: '直营店包括北大街等', category: 'finance_scope',
        source: 'manual', created_by: 'admin', updated_at: '2026-06-01T10:00:00+08:00',
      },
      {
        id: 'e2', title: '钉钉考勤打卡流水字段说明', content: 'attendance.records 字段说明', category: 'connector_query_knowledge',
        source: 'manual', created_by: 'admin', updated_at: '2026-06-01T10:00:00+08:00',
      },
    ]);
  });

  it('渲染各功能分区(财务模块默认)', async () => {
    render(<KnowledgeBasePage />);

    expect(screen.getByText('知识库')).toBeTruthy();
    // 内置栏目 tab
    for (const label of ['通用', '财务', '人事', '连接器配置', '产品']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // 财务专属分区与数据渲染
    await waitFor(() => {
      expect(screen.getByText('财务流程与报表模板')).toBeTruthy();
      expect(screen.getByText('对账模板')).toBeTruthy();
      expect(screen.getByText('营业收入回款表')).toBeTruthy();   // 报表模板卡片
      expect(screen.getByText('美团外卖')).toBeTruthy();          // 对账模板卡片
      expect(screen.getByText('直营店范围')).toBeTruthy();        // 知识条目
    });
    // 就绪度横幅
    await waitFor(() => {
      expect(screen.getByText(/租户配置完整度/)).toBeTruthy();
      expect(screen.getByText(/缺少平台简称说明/)).toBeTruthy();
    });
    // 管理员按钮
    expect(screen.getByText('上传对账模板')).toBeTruthy();
    expect(screen.getAllByText('新增条目').length).toBeGreaterThan(0);
    expect(screen.getByText('回款表首月期初')).toBeTruthy();
  });

  it('切换到人事栏目后财务分区消失、工资表面板出现', async () => {
    render(<KnowledgeBasePage />);
    await waitFor(() => expect(screen.getByText('财务流程与报表模板')).toBeTruthy());

    fireEvent.click(screen.getByText('人事'));

    expect(screen.queryByText('财务流程与报表模板')).toBeNull();
    expect(screen.queryByText('上传对账模板')).toBeNull();
    expect(screen.getByText('工资表模板面板')).toBeTruthy();
  });

  it('连接器配置栏目单独展示数据字段说明', async () => {
    render(<KnowledgeBasePage />);
    await waitFor(() => expect(screen.getByText('财务流程与报表模板')).toBeTruthy());

    fireEvent.click(screen.getByText('连接器配置'));

    expect(screen.queryByText('财务流程与报表模板')).toBeNull();
    expect(screen.queryByText('工资表模板面板')).toBeNull();
    expect(screen.getByText('钉钉考勤打卡流水字段说明')).toBeTruthy();
  });

  it('上传对账模板弹窗可打开关闭', async () => {
    render(<KnowledgeBasePage />);
    await waitFor(() => expect(screen.getByText('对账模板')).toBeTruthy());

    fireEvent.click(screen.getByText('上传对账模板'));
    expect(screen.getByText('JSON 模板文件')).toBeTruthy();
    expect(screen.getByText('保存模板')).toBeTruthy();

    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByText('JSON 模板文件')).toBeNull();
  });

  it('回款表首月期初面板可展开', async () => {
    render(<KnowledgeBasePage />);
    await waitFor(() => expect(screen.getByText('回款表首月期初')).toBeTruthy());

    fireEvent.click(screen.getByText('回款表首月期初'));
    expect(screen.getByText(/营业收入回款表 · 首月期初/)).toBeTruthy();
    expect(screen.getByText('上传上月回款表')).toBeTruthy();
  });

  it('删除自定义类型时清理重复栏目元数据', async () => {
    kbApiMocks.listKbEntries.mockResolvedValue([
      {
        id: 'm1',
        title: '财务知识类型',
        content: JSON.stringify({
          id: 'finance',
          label: '财务',
          description: '对账、账单模板、报表模板、回款映射',
          categories: ['reconcile', 'report', 'finance_custom'],
          categoryLabels: { finance_custom: '自定义类型' },
          accent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        }),
        category: 'knowledge_module',
        source: 'manual',
        created_by: 'admin',
        updated_at: '2026-06-01T10:00:00+08:00',
      },
      {
        id: 'm2',
        title: '财务知识类型副本',
        content: JSON.stringify({
          id: 'finance',
          label: '财务',
          description: '对账、账单模板、报表模板、回款映射',
          categories: ['reconcile', 'report', 'finance_custom'],
          categoryLabels: { finance_custom: '自定义类型' },
          accent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        }),
        category: 'knowledge_module',
        source: 'manual',
        created_by: 'admin',
        updated_at: '2026-06-01T10:00:00+08:00',
      },
    ]);
    render(<KnowledgeBasePage />);

    fireEvent.mouseDown(await screen.findByRole('combobox'));
    fireEvent.click(await screen.findByText('自定义类型'));
    fireEvent.click(screen.getByText('删除类型'));
    fireEvent.click(screen.getByText('确认'));

    await waitFor(() => {
      expect(kbApiMocks.updateKbEntry).toHaveBeenCalledWith('m1', expect.objectContaining({
        content: expect.not.stringContaining('finance_custom'),
      }));
      expect(kbApiMocks.deleteKbEntry).toHaveBeenCalledWith('m2');
    });
  });
});
