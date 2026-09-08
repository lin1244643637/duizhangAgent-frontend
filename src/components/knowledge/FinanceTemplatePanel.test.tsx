import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import type { EditingInstruction } from './FinanceTemplatePanel';
import { FinanceTemplatePanel } from './FinanceTemplatePanel';

function Harness({
  onSaveGlobal = vi.fn(),
  onToggleDetail = vi.fn(),
}: {
  onSaveGlobal?: () => void;
  onToggleDetail?: () => void;
}) {
  const [globalOpen, setGlobalOpen] = useState(false);
  const [globalText, setGlobalText] = useState('');
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedPeriod, setSeedPeriod] = useState('2026-06');
  const [templateInstructionOpen, setTemplateInstructionOpen] = useState<Record<string, boolean>>({});
  const [templateInstructionText, setTemplateInstructionText] = useState<Record<string, string>>({});
  const [editingInstruction, setEditingInstruction] = useState<EditingInstruction>(null);

  return (
    <FinanceTemplatePanel
      isAdmin
      templateSaving={false}
      readiness={null}
      reportTemplates={[
        {
          id: 'tpl-1',
          template_type: 'revenue_collection',
          template_label: '营业收入回款表',
          original_filename: '回款表.xlsx',
          sheet_count: 9,
          updated_at: '2026-06-01T10:00:00+08:00',
          has_global_instruction: false,
          has_template_instruction: false,
          instruction_updated_at: undefined,
        },
      ]}
      reportTemplateDetails={{}}
      globalInstructionOpen={globalOpen}
      setGlobalInstructionOpen={setGlobalOpen}
      globalInstructionText={globalText}
      setGlobalInstructionText={setGlobalText}
      seedOpen={seedOpen}
      setSeedOpen={setSeedOpen}
      seedPeriod={seedPeriod}
      setSeedPeriod={setSeedPeriod}
      templateInstructionOpen={templateInstructionOpen}
      setTemplateInstructionOpen={setTemplateInstructionOpen}
      templateInstructionText={templateInstructionText}
      setTemplateInstructionText={setTemplateInstructionText}
      editingInstruction={editingInstruction}
      setEditingInstruction={setEditingInstruction}
      handleFinanceProcessFile={vi.fn()}
      handleGlobalReportInstructionFile={vi.fn()}
      handleReportTemplateFile={vi.fn()}
      handleCarryforwardSeedFile={vi.fn()}
      handleGlobalReportInstructionText={onSaveGlobal}
      toggleReportTemplateDetail={onToggleDetail}
      handleDeleteReportTemplate={vi.fn()}
      handleTemplateInstructionFile={vi.fn()}
      handleTemplateInstructionText={vi.fn()}
      handleUpdateInstruction={vi.fn()}
      handleDeleteInstruction={vi.fn()}
    />
  );
}

describe('FinanceTemplatePanel', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverMock });
    Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverMock });
  });

  it('saves global report instruction text', () => {
    const onSaveGlobal = vi.fn();
    render(<Harness onSaveGlobal={onSaveGlobal} />);

    fireEvent.click(screen.getAllByText('新增说明')[0]);
    fireEvent.change(screen.getByPlaceholderText(/主营业务收入/), {
      target: { value: '各门店实收按 net_amount 填充' },
    });
    fireEvent.click(screen.getByText('保存输入说明'));

    expect(onSaveGlobal).toHaveBeenCalled();
  });

  it('keeps report template preview toggle wired', () => {
    const onToggleDetail = vi.fn();
    render(<Harness onToggleDetail={onToggleDetail} />);

    fireEvent.click(screen.getByText('查看解析预览'));

    expect(onToggleDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-1' }));
  });
});
