/** QueryEvidencePanel 冒烟测试：一键「补充字段」按钮触发 add_columns 追问。 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/connectors', () => ({ downloadQueryExport: vi.fn() }));
vi.mock('../api/kb', () => ({ createKbEntry: vi.fn(), deleteKbEntry: vi.fn(), updateKbEntry: vi.fn() }));

import { QueryEvidencePanel } from './QueryEvidencePanel';
import { createKbEntry } from '../api/kb';
import type { KnowledgeContext, KnowledgeSuggestion, QueryEvidence } from '../types';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

beforeEach(() => {
  vi.clearAllMocks();
});

function makeEvidence(overrides: Partial<QueryEvidence> = {}): QueryEvidence {
  return {
    dataset_ids: ['ds-1'],
    dataset_name: '钉钉考勤月度考勤结果',
    date_range: { from: '2026-05-01', to: '2026-05-31' },
    scope: 'all',
    fields: ['考勤结果'],
    filters: [],
    group_by: [],
    metrics: [],
    knowledge_entries: [],
    row_counts: { all: null, date_filtered: 237, field_filtered: null, scope_filtered: null, returned: 200, truncated: true },
    warnings: [],
    ...overrides,
  };
}

function renderPanel(evidence: QueryEvidence, onRequery = vi.fn(), knowledgeContext?: KnowledgeContext | null) {
  render(
    <QueryEvidencePanel
      evidence={evidence}
      knowledgeSuggestion={null}
      queryExport={null}
      knowledgeContext={knowledgeContext}
      sessionId="t1:s1"
      question="给我五月考勤结果"
      onRequery={onRequery}
    />,
  );
  return onRequery;
}

describe('FieldAugmentCard', () => {
  it('对人员/考勤结果展示缺失字段的一键补充按钮', () => {
    renderPanel(makeEvidence());
    expect(screen.getByText('+ 姓名')).toBeTruthy();
    expect(screen.getByText('+ 部门')).toBeTruthy();
  });

  it('点击「+ 姓名」发出 add_columns 追问', () => {
    const onRequery = renderPanel(makeEvidence());
    fireEvent.click(screen.getByText('+ 姓名'));
    expect(onRequery).toHaveBeenCalledWith('把姓名加上');
  });

  it('优先展示后端按结果推断出的可补字段', () => {
    renderPanel(makeEvidence({ augment_fields: ['职位', '用工类型'] }));
    expect(screen.getByText('+ 职位')).toBeTruthy();
    expect(screen.getByText('+ 用工类型')).toBeTruthy();
    expect(screen.queryByText('+ 姓名')).toBeNull();
  });

  it('后端明确没有可补字段时不使用固定兜底', () => {
    renderPanel(makeEvidence({ augment_fields: [] }));
    expect(screen.queryByText(/在这份结果上补充字段/)).toBeNull();
    expect(screen.queryByText('+ 姓名')).toBeNull();
  });

  it('已展示的字段不再提示补充', () => {
    renderPanel(makeEvidence({ fields: ['姓名', '部门', '考勤结果'] }));
    expect(screen.queryByText('+ 姓名')).toBeNull();
    expect(screen.queryByText('+ 部门')).toBeNull();
  });

  it('非人员类结果（纯财务表）不提示补姓名', () => {
    renderPanel(makeEvidence({ dataset_name: '银行流水汇总', fields: ['入账金额', '交易时间'] }));
    expect(screen.queryByText('+ 姓名')).toBeNull();
  });

  it('查询依据中展示知识召回 trace 和缺失项', () => {
    renderPanel(
      makeEvidence(),
      vi.fn(),
      {
        trace: [{ title: '排班工时字段说明', category: 'connector_field_note' }],
        missing: [
          {
            title: '缺少实际工时字段说明',
            content: '数据集「排班工时」里，已有字段「实际字段名」表示「实际工时」。',
            category: 'connector_field_note',
          },
        ],
      },
    );
    fireEvent.click(screen.getByText(/展开/));
    expect(screen.getByText('排班工时字段说明')).toBeTruthy();
    expect(screen.getByText('数据集「排班工时」里，已有字段「实际字段名」表示「实际工时」。')).toBeTruthy();
  });

  it('没有查询依据时普通用户只展示联系管理员提示', () => {
    render(
      <QueryEvidencePanel
        evidence={null}
        knowledgeSuggestion={null}
        queryExport={null}
        knowledgeContext={{ suggestions: ['数据集「排班」里，字段「实际工时」表示实际工时。'] }}
        sessionId="t1:s1"
        question="给我工时"
        onRequery={vi.fn()}
      />,
    );

    expect(screen.getByText('当前查询缺少可稳定使用的知识配置，请联系租户管理员补充后重新查询。')).toBeTruthy();
  });

  it('没有查询依据时管理员可查看知识补全建议', () => {
    render(
      <QueryEvidencePanel
        evidence={null}
        knowledgeSuggestion={null}
        queryExport={null}
        knowledgeContext={{ suggestions: ['数据集「排班」里，字段「实际工时」表示实际工时。'] }}
        sessionId="t1:s1"
        question="给我工时"
        onRequery={vi.fn()}
        isAdmin
      />,
    );

    expect(screen.getByText('可补充知识')).toBeTruthy();
    expect(screen.getByText('数据集「排班」里，字段「实际工时」表示实际工时。')).toBeTruthy();
  });

  it('管理员可编辑并保存知识建议', async () => {
    vi.mocked(createKbEntry).mockResolvedValue({
      id: 'kb-1',
      title: '工时字段说明',
      category: 'connector_field_note',
      content: '字段「实际工时」表示实际工时。',
      source: 'connector_query_suggestion',
      created_by: 'admin-1',
      created_at: '',
      updated_at: '',
    });
    const suggestion: KnowledgeSuggestion = {
      dataset_id: 'ds-1',
      dataset_name: '排班工时',
      kind: 'field_note',
      missing_term: '实际工时',
      category: 'connector_field_note',
      title: '工时字段说明',
      content: '字段「{{字段名}}」表示实际工时。',
      available_fields: ['实际工时'],
      message: '',
      editable_placeholder: '{{字段名}}',
    };

    render(
      <QueryEvidencePanel
        evidence={null}
        knowledgeSuggestion={suggestion}
        queryExport={null}
        knowledgeContext={null}
        sessionId="t1:s1"
        question="给我工时"
        onRequery={vi.fn()}
        isAdmin
      />,
    );

    fireEvent.click(screen.getByText('实际工时'));
    expect(screen.getByDisplayValue('字段「实际工时」表示实际工时。')).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('工时字段说明'), { target: { value: '实际工时字段说明' } });
    fireEvent.click(screen.getByText('保存到知识库'));

    await waitFor(() => {
      expect(createKbEntry).toHaveBeenCalledWith({
        title: '实际工时字段说明',
        content: '字段「实际工时」表示实际工时。',
        category: 'connector_field_note',
        source: 'connector_query_suggestion',
      });
    });
  });
});
