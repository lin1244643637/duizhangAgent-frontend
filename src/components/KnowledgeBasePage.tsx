import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select } from 'antd';
import { useAuthStore } from '../store/authStore';
import {
  createKbEntry,
  deleteKbEntry,
  deleteGlobalReportInstruction,
  deleteReportTemplate,
  deleteReportTemplateInstruction,
  deleteReconcileTemplate,
  draftReconcileTemplateFromExcel,
  importSeedReconcileTemplates,
  getKnowledgeReadiness,
  getReportTemplate,
  listKbEntries,
  listReportTemplates,
  listReconcileTemplates,
  saveReconcileTemplate,
  seedRevenueCollectionCarryforward,
  updateKbEntry,
  uploadFinanceProcessDocx,
  uploadGlobalReportInstruction,
  uploadReportTemplate,
  uploadReportTemplateInstruction,
  updateGlobalReportInstruction,
  updateReportTemplateInstruction,
} from '../api/kb';
import type { KbEntry, KnowledgeReadiness, ReconcileTemplateSummary, ReportTemplateDetail, ReportTemplateSummary } from '../types';
import { KnowledgeEntryEditor } from './KnowledgeEntryEditor';
import { ConfirmDialog } from './ConfirmDialog';
import { SalaryTemplatePanel } from './SalaryTemplatePanel';
import { KnowledgeCandidatesPanel } from './KnowledgeCandidatesPanel';

import {
  BUILTIN_MODULES,
  CATEGORY_LABEL,
  CUSTOM_MODULES_KEY,
  categoryLabel,
  normalizeCategoryId,
  normalizeModuleId,
  type KnowledgeModule,
} from './knowledge/helpers';
import { FinanceTemplatePanel } from './knowledge/FinanceTemplatePanel';
import { KnowledgeEntryList } from './knowledge/KnowledgeEntryList';
import { ReconcileTemplateDialog } from './knowledge/ReconcileTemplateDialog';
import { ReconcileTemplateSection } from './knowledge/ReconcileTemplateSection';
import { currentBeijingPeriod } from '../utils/time';

export function KnowledgeBasePage() {
  const { role } = useAuthStore();
  const isAdmin = role === 'admin';

  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [activeModuleId, setActiveModuleId] = useState('finance');
  const [customModules, setCustomModules] = useState<KnowledgeModule[]>([]);
  const [newModuleName, setNewModuleName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [moduleEditorOpen, setModuleEditorOpen] = useState(false);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [editing, setEditing] = useState<KbEntry | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateProvider, setTemplateProvider] = useState('');
  const [templateJson, setTemplateJson] = useState('');
  const [templateSummary, setTemplateSummary] = useState<ReconcileTemplateSummary[]>([]);
  const [reportTemplates, setReportTemplates] = useState<ReportTemplateSummary[]>([]);
  const [readiness, setReadiness] = useState<KnowledgeReadiness | null>(null);
  const [reportTemplateDetails, setReportTemplateDetails] = useState<Record<string, ReportTemplateDetail>>({});
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateDrafting, setTemplateDrafting] = useState(false);
  const [templateExcelFile, setTemplateExcelFile] = useState<File | null>(null);
  const [templateRules, setTemplateRules] = useState('');
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [globalInstructionText, setGlobalInstructionText] = useState('');
  const [templateInstructionText, setTemplateInstructionText] = useState<Record<string, string>>({});
  const [globalInstructionOpen, setGlobalInstructionOpen] = useState(false);
  const [templateInstructionOpen, setTemplateInstructionOpen] = useState<Record<string, boolean>>({});
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedPeriod, setSeedPeriod] = useState(() => currentBeijingPeriod());
  const [editingInstruction, setEditingInstruction] = useState<{ templateId: string | null; itemId: string; text: string } | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_MODULES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as KnowledgeModule[];
      if (Array.isArray(parsed)) {
        setCustomModules(parsed.filter((item) => item.id && item.label && Array.isArray(item.categories)));
      }
    } catch {
      setCustomModules([]);
    }
  }, []);

  const persistedCustomModules = useMemo(() => entries
    .filter((entry) => entry.category === 'knowledge_module')
    .map((entry): KnowledgeModule | null => {
      try {
        const data = JSON.parse(entry.content) as Partial<KnowledgeModule>;
        if (!data.id || !data.label || !Array.isArray(data.categories)) return null;
        return {
          id: data.id,
          label: data.label,
          description: data.description || `${data.label}智能体知识`,
          categories: data.categories,
          categoryLabels: data.categoryLabels || {},
          accent: data.accent || 'bg-cyan-50 text-cyan-700 border-cyan-200',
          custom: true,
        };
      } catch {
        const id = normalizeModuleId(entry.title);
        return {
          id,
          label: entry.title,
          description: `${entry.title}智能体知识`,
          categories: [id],
          accent: 'bg-cyan-50 text-cyan-700 border-cyan-200',
          custom: true,
        };
      }
    })
    .filter((item): item is KnowledgeModule => item !== null), [entries]);
  const modules = useMemo(() => {
    const byId = new Map<string, KnowledgeModule>();
    [...BUILTIN_MODULES, ...persistedCustomModules, ...customModules].forEach((item) => {
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, {
          ...item,
          categories: [...item.categories],
          categoryLabels: { ...(item.categoryLabels || {}) },
        });
        return;
      }
      const categories = [...existing.categories];
      item.categories.forEach((category) => {
        if (!categories.includes(category)) categories.push(category);
      });
      byId.set(item.id, {
        ...existing,
        description: existing.description || item.description,
        categories,
        categoryLabels: {
          ...(existing.categoryLabels || {}),
          ...(item.categoryLabels || {}),
        },
        custom: existing.custom || item.custom,
      });
    });
    return Array.from(byId.values());
  }, [persistedCustomModules, customModules]);
  const activeModule = modules.find((item) => item.id === activeModuleId) ?? BUILTIN_MODULES[0];
  const moduleCategories = activeModule.categories;
  function displayCategoryLabel(category: string): string {
    const labeledOwner = modules.find((item) => item.categoryLabels?.[category]);
    if (labeledOwner?.categoryLabels?.[category]) return labeledOwner.categoryLabels[category];
    const owner = modules.find((item) => item.custom && item.categories.includes(category));
    return owner?.label ?? categoryLabel(category);
  }

  function toggleEntryExpanded(entryId: string) {
    setExpandedEntries((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  const moduleCategoryOptions = useMemo(() => (
    moduleCategories.map((category) => ({ value: category, label: displayCategoryLabel(category) }))
  ), [moduleCategories, modules]);
  const editorCategories = useMemo(() => {
    const builtInOptions = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
    const merged = [...moduleCategoryOptions, ...builtInOptions];
    return merged.filter((item, index, arr) => arr.findIndex((other) => other.value === item.value) === index);
  }, [moduleCategoryOptions]);
  const defaultEntryCategory = categoryFilter || moduleCategories[0] || 'general';

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [rows, templates, reportTemplateRows] = await Promise.all([
        listKbEntries(),
        listReconcileTemplates(),
        listReportTemplates(),
      ]);
      setEntries(rows);
      setTemplateSummary(templates);
      setReportTemplates(reportTemplateRows);
      try {
        setReadiness(await getKnowledgeReadiness('all'));
      } catch {
        setReadiness(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    let moduleRows = entries.filter((entry) => moduleCategories.includes(entry.category));
    if (categoryFilter) moduleRows = moduleRows.filter((entry) => entry.category === categoryFilter);
    if (!keyword.trim()) return moduleRows;
    const kw = keyword.trim().toLowerCase();
    return moduleRows.filter(
      (e) => e.title.toLowerCase().includes(kw) || e.content.toLowerCase().includes(kw),
    );
  }, [entries, keyword, moduleCategories, categoryFilter]);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(entry: KbEntry) {
    setEditing(entry);
    setEditorOpen(true);
  }

  function switchModule(moduleId: string) {
    setActiveModuleId(moduleId);
    setCategoryFilter('');
    setKeyword('');
  }

  async function handleAddModule() {
    const label = newModuleName.trim();
    if (!label) return;
    const baseId = normalizeModuleId(label);
    const existingIds = new Set(modules.map((item) => item.id));
    let id = baseId;
    let index = 2;
    while (existingIds.has(id)) {
      id = `${baseId}_${index}`;
      index += 1;
    }
    const nextModule: KnowledgeModule = {
      id,
      label,
      description: `${label}智能体知识`,
      categories: [id],
      accent: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      custom: true,
    };
    const next = [...customModules, nextModule];
    setCustomModules(next);
    localStorage.setItem(CUSTOM_MODULES_KEY, JSON.stringify(next));
    try {
      await createKbEntry({
        title: label,
        category: 'knowledge_module',
        content: JSON.stringify(nextModule, null, 2),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setNewModuleName('');
    setModuleEditorOpen(false);
    switchModule(id);
  }

  async function handleAddCategory() {
    const label = newCategoryName.trim();
    if (!label) return;
    const existingLabels = moduleCategoryOptions.map((item) => item.label.trim());
    if (existingLabels.includes(label)) {
      setError(`「${activeModule.label}」中已存在类型「${label}」`);
      return;
    }
    const existingCategoryIds = new Set(modules.flatMap((item) => item.categories));
    let categoryId = normalizeCategoryId(activeModule.id, label);
    let index = 2;
    while (existingCategoryIds.has(categoryId)) {
      categoryId = `${normalizeCategoryId(activeModule.id, label)}_${index}`;
      index += 1;
    }

    const existingModuleEntries = entries.filter((entry) => {
      if (entry.category !== 'knowledge_module') return false;
      try {
        const data = JSON.parse(entry.content) as Partial<KnowledgeModule>;
        return data.id === activeModule.id;
      } catch {
        return false;
      }
    });
    const nextModule: KnowledgeModule = {
      id: activeModule.id,
      label: activeModule.label,
      description: activeModule.description,
      categories: [...activeModule.categories, categoryId],
      categoryLabels: {
        ...(activeModule.categoryLabels || {}),
        [categoryId]: label,
      },
      accent: activeModule.accent,
      custom: activeModule.custom,
    };

    try {
      if (existingModuleEntries.length > 0) {
        const [primaryEntry, ...duplicateEntries] = existingModuleEntries;
        await updateKbEntry(primaryEntry.id, {
          title: primaryEntry.title,
          category: primaryEntry.category,
          content: JSON.stringify(nextModule, null, 2),
        });
        await Promise.all(duplicateEntries.map((entry) => deleteKbEntry(entry.id)));
      } else {
        await createKbEntry({
          title: `${activeModule.label}知识类型`,
          category: 'knowledge_module',
          content: JSON.stringify(nextModule, null, 2),
        });
      }
      setNewCategoryName('');
      setCategoryEditorOpen(false);
      setCategoryFilter(categoryId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function handleDeleteCategory(category: string) {
    const label = displayCategoryLabel(category);
    if (!activeModule.categoryLabels?.[category]) {
      setError('内置类型不能删除，只能删除手动添加的类型');
      return;
    }
    const usedEntries = entries.filter((entry) => entry.category === category);
    if (usedEntries.length > 0) {
      setError(`类型「${label}」下还有 ${usedEntries.length} 条知识。请先删除这些知识，或编辑到其他类型后再删除类型。`);
      return;
    }

    setConfirmDialog({
      message: `确认删除类型「${label}」？删除后新增知识时将不再显示这个类型。`,
      onConfirm: async () => {
        try {
          const existingModuleEntries = entries.filter((entry) => {
            if (entry.category !== 'knowledge_module') return false;
            try {
              const data = JSON.parse(entry.content) as Partial<KnowledgeModule>;
              return data.id === activeModule.id;
            } catch {
              return false;
            }
          });
          const nextLabels = { ...(activeModule.categoryLabels || {}) };
          delete nextLabels[category];
          const nextModule: KnowledgeModule = {
            id: activeModule.id,
            label: activeModule.label,
            description: activeModule.description,
            categories: activeModule.categories.filter((item) => item !== category),
            categoryLabels: nextLabels,
            accent: activeModule.accent,
            custom: activeModule.custom,
          };
          if (existingModuleEntries.length > 0) {
            const [primaryEntry, ...duplicateEntries] = existingModuleEntries;
            await updateKbEntry(primaryEntry.id, {
              title: primaryEntry.title,
              category: primaryEntry.category,
              content: JSON.stringify(nextModule, null, 2),
            });
            await Promise.all(duplicateEntries.map((entry) => deleteKbEntry(entry.id)));
          }
          const nextCustomModules = customModules.map((item) => {
            if (item.id !== activeModule.id) return item;
            const labels = { ...(item.categoryLabels || {}) };
            delete labels[category];
            return {
              ...item,
              categories: item.categories.filter((candidate) => candidate !== category),
              categoryLabels: labels,
            };
          });
          setCustomModules(nextCustomModules);
          localStorage.setItem(CUSTOM_MODULES_KEY, JSON.stringify(nextCustomModules));
          if (categoryFilter === category) setCategoryFilter('');
          await refresh();
        } catch (e) {
          setError((e as Error).message);
        }
      },
    });
  }

  async function handleSave(body: { title: string; content: string; category: string }) {
    if (editing) {
      await updateKbEntry(editing.id, body);
    } else {
      await createKbEntry(body);
    }
    await refresh();
  }

  function handleDelete(entry: KbEntry) {
    setConfirmDialog({
      message: `确认删除「${entry.title}」？`,
      onConfirm: async () => {
        try {
          await deleteKbEntry(entry.id);
          await refresh();
        } catch (e) {
          setError((e as Error).message);
        }
      },
    });
  }

  function deriveProviderFromFile(filename: string): string {
    let stem = filename.replace(/\.xlsx?$/i, '');
    // 先去 YYYYMMDD（如 20260402），再去 YYYYMM 或 YYYY-MM-DD
    stem = stem.replace(/20[2-3]\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])/g, '');
    stem = stem.replace(/20[2-3]\d[./\-_]?\d{2}(?:[./\-_]\d{2})?/g, '');
    // 去序号前缀 '2314. '
    stem = stem.replace(/^\d+[.\s]+/, '').trim();
    // 去首部长纯数字门店 ID
    stem = stem.replace(/^\d{6,}[-_]/, '');
    // 去末尾长纯数字 ID
    stem = stem.replace(/[-_]\d{6,}/g, '');
    // 去末尾孤立序号 _1 _2
    stem = stem.replace(/[-_]\d{1,2}$/, '');
    return stem.replace(/^[-_ ]+|[-_ ]+$/g, '') || 'template';
  }

  async function handleJsonTemplateFile(file: File | null) {
    if (!file) return;
    setTemplateProvider((prev) => prev || deriveProviderFromFile(file.name));
    setTemplateJson(await file.text());
    setTemplateMessage(null);
    setError(null);
  }

  async function handleExcelTemplateFile(file: File | null) {
    setTemplateExcelFile(file);
    setTemplateMessage(null);
    setTemplateError(null);
  }

  async function handleGenerateTemplate() {
    if (!templateExcelFile) return;
    setTemplateDrafting(true);
    setTemplateMessage(null);
    setTemplateError(null);
    try {
      const draft = await draftReconcileTemplateFromExcel(templateExcelFile, templateProvider, templateRules);
      setTemplateProvider(draft.provider || templateProvider);
      setTemplateJson(JSON.stringify(draft.template, null, 2));
      setTemplateMessage('Excel 样例已转换为模板草稿，请检查后保存');
    } catch (e) {
      setTemplateError((e as Error).message);
    } finally {
      setTemplateDrafting(false);
    }
  }

  function previewTemplate() {
    const data = JSON.parse(templateJson) as {
      platform_name?: string;
      file_keywords?: string[];
      sheets?: Array<{ columns?: Record<string, string> }>;
    };
    const sheets = Array.isArray(data.sheets) ? data.sheets : [];
    const fieldCount = sheets.reduce((sum, s) => sum + Object.keys(s.columns ?? {}).length, 0);
    return {
      platformName: data.platform_name || '未命名平台',
      keywords: Array.isArray(data.file_keywords) ? data.file_keywords : [],
      sheetCount: sheets.length,
      fieldCount,
    };
  }

  async function handleSaveTemplate() {
    if (!templateProvider.trim() || !templateJson.trim()) {
      setTemplateError('provider 与模板 JSON 不能为空');
      return;
    }
    setTemplateSaving(true);
    setTemplateError(null);
    setTemplateMessage(null);
    try {
      const template = JSON.parse(templateJson) as Record<string, unknown>;
      await saveReconcileTemplate({
        provider: templateProvider.trim(),
        template,
        overwrite: true,
      });
      setTemplateMessage('模板已保存');
      setTemplateOpen(false);
      setTemplateProvider('');
      setTemplateJson('');
      setTemplateRules('');
      setTemplateExcelFile(null);
      setTemplateError(null);
      await refresh();
    } catch (e) {
      setTemplateError((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  function handleImportSeeds() {
    setConfirmDialog({
      message: '将现有 config/templates 种子模板导入当前租户知识库。已存在模板默认跳过，确认导入？',
      onConfirm: async () => {
        setTemplateSaving(true);
        setError(null);
        setTemplateMessage(null);
        try {
          const result = await importSeedReconcileTemplates(false);
          const errPart = result.errors.length ? `，失败 ${result.errors.length} 个` : '';
          setTemplateMessage(`种子模板导入完成：新增 ${result.imported} 个，跳过 ${result.skipped} 个${errPart}`);
          await refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setTemplateSaving(false);
        }
      },
    });
  }

  async function handleReportTemplateFile(file: File | null) {
    if (!file) return;
    setTemplateSaving(true);
    setError(null);
    setTemplateMessage(null);
    try {
      const tpl = await uploadReportTemplate(file);
      setTemplateMessage(`财务报表模板已保存：${tpl.template_label}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleCarryforwardSeedFile(file: File | null) {
    if (!file) return;
    if (!/^\d{4}-\d{2}$/.test(seedPeriod)) {
      setError('请先填写要播种的账期，格式如 2026-05');
      return;
    }
    setTemplateSaving(true);
    setError(null);
    setTemplateMessage(null);
    try {
      const res = await seedRevenueCollectionCarryforward(file, seedPeriod);
      const sheets = Object.entries(res.unsettled_sheets)
        .map(([sheet, count]) => `${sheet}(${count}店)`)
        .join('、');
      setTemplateMessage(
        `已为 ${res.period} 播种期初：${res.opening_items} 个收入项余额` +
          (sheets ? `；未结：${sheets}` : '') +
          '。之后逐月自动结转，无需再上传。',
      );
      setSeedOpen(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function toggleReportTemplateDetail(tpl: ReportTemplateSummary) {
    if (reportTemplateDetails[tpl.id]) {
      setReportTemplateDetails((prev) => {
        const next = { ...prev };
        delete next[tpl.id];
        return next;
      });
      return;
    }
    setTemplateSaving(true);
    setError(null);
    try {
      const detail = await getReportTemplate(tpl.id);
      setReportTemplateDetails((prev) => ({ ...prev, [tpl.id]: detail }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleFinanceProcessFile(file: File | null) {
    if (!file) return;
    setTemplateSaving(true);
    setError(null);
    setTemplateMessage(null);
    try {
      await uploadFinanceProcessDocx(file);
      setTemplateMessage('财务流程知识已入库');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleGlobalReportInstructionFile(file: File | null) {
    if (!file) return;
    setTemplateSaving(true);
    setError(null);
    setTemplateMessage(null);
    try {
      await uploadGlobalReportInstruction(file);
      setTemplateMessage('全局报表说明已保存');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleGlobalReportInstructionText() {
    if (!globalInstructionText.trim()) {
      setError('请输入全局报表说明内容');
      return;
    }
    setTemplateSaving(true);
    setError(null);
    setTemplateMessage(null);
    try {
      await uploadGlobalReportInstruction(null, globalInstructionText);
      setGlobalInstructionText('');
      setGlobalInstructionOpen(false);
      setTemplateMessage('全局报表说明已保存');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleTemplateInstructionFile(tpl: ReportTemplateSummary, file: File | null) {
    if (!file) return;
    setTemplateSaving(true);
    setError(null);
    setTemplateMessage(null);
    try {
      await uploadReportTemplateInstruction(tpl.id, file);
      setTemplateMessage(`模板说明已保存：${tpl.template_label}`);
      await refresh();
      if (reportTemplateDetails[tpl.id]) {
        const detail = await getReportTemplate(tpl.id);
        setReportTemplateDetails((prev) => ({ ...prev, [tpl.id]: detail }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleTemplateInstructionText(tpl: ReportTemplateSummary) {
    const text = (templateInstructionText[tpl.id] ?? '').trim();
    if (!text) {
      setError('请输入模板说明内容');
      return;
    }
    setTemplateSaving(true);
    setError(null);
    setTemplateMessage(null);
    try {
      await uploadReportTemplateInstruction(tpl.id, null, text);
      setTemplateInstructionText((prev) => ({ ...prev, [tpl.id]: '' }));
      setTemplateInstructionOpen((prev) => ({ ...prev, [tpl.id]: false }));
      setTemplateMessage(`模板说明已保存：${tpl.template_label}`);
      await refresh();
      if (reportTemplateDetails[tpl.id]) {
        const detail = await getReportTemplate(tpl.id);
        setReportTemplateDetails((prev) => ({ ...prev, [tpl.id]: detail }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleUpdateInstruction() {
    if (!editingInstruction?.text.trim()) {
      setError('请输入说明内容');
      return;
    }
    setTemplateSaving(true);
    setError(null);
    setTemplateMessage(null);
    try {
      if (editingInstruction.templateId) {
        await updateReportTemplateInstruction(
          editingInstruction.templateId,
          editingInstruction.itemId,
          editingInstruction.text,
        );
        const detail = await getReportTemplate(editingInstruction.templateId);
        setReportTemplateDetails((prev) => ({ ...prev, [editingInstruction.templateId as string]: detail }));
      } else {
        await updateGlobalReportInstruction(editingInstruction.itemId, editingInstruction.text);
        const detailEntries = Object.keys(reportTemplateDetails);
        for (const templateId of detailEntries) {
          const detail = await getReportTemplate(templateId);
          setReportTemplateDetails((prev) => ({ ...prev, [templateId]: detail }));
        }
      }
      setEditingInstruction(null);
      setTemplateMessage('说明已更新');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  function handleDeleteInstruction(templateId: string | null, itemId: string, label: string) {
    setConfirmDialog({
      message: `确认删除这条${label}？删除后对应规则会立即从后续报表生成中移除。`,
      onConfirm: async () => {
        setTemplateSaving(true);
        setError(null);
        setTemplateMessage(null);
        try {
          if (templateId) {
            await deleteReportTemplateInstruction(templateId, itemId);
            const detail = await getReportTemplate(templateId);
            setReportTemplateDetails((prev) => ({ ...prev, [templateId]: detail }));
          } else {
            await deleteGlobalReportInstruction(itemId);
            const detailEntries = Object.keys(reportTemplateDetails);
            for (const openTemplateId of detailEntries) {
              const detail = await getReportTemplate(openTemplateId);
              setReportTemplateDetails((prev) => ({ ...prev, [openTemplateId]: detail }));
            }
          }
          setEditingInstruction(null);
          setTemplateMessage(`${label}已删除`);
          await refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setTemplateSaving(false);
        }
      },
    });
  }

  function handleDeleteReportTemplate(tpl: ReportTemplateSummary) {
    setConfirmDialog({
      message: `确认删除财务报表模板「${tpl.template_label || tpl.original_filename}」？`,
      onConfirm: async () => {
        setTemplateSaving(true);
        setError(null);
        setTemplateMessage(null);
        try {
          await deleteReportTemplate(tpl.id);
          setTemplateMessage('财务报表模板已删除');
          await refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setTemplateSaving(false);
        }
      },
    });
  }

  function openEditTemplate(tpl: ReconcileTemplateSummary) {
    const entry = entries.find(e => e.id === tpl.id);
    const json = entry ? JSON.stringify(JSON.parse(entry.content), null, 2) : '{}';
    setTemplateProvider(tpl.provider);
    setTemplateJson(json);
    setTemplateOpen(true);
  }

  function handleDeleteTemplate(tpl: ReconcileTemplateSummary) {
    setConfirmDialog({
      message: `确认删除对账模板「${tpl.platform_name || tpl.provider}」？删除后同类账单将无法解析。`,
      onConfirm: async () => {
        setTemplateSaving(true);
        setError(null);
        setTemplateMessage(null);
        try {
          await deleteReconcileTemplate(tpl.provider);
          setTemplateMessage('模板已删除');
          await refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setTemplateSaving(false);
        }
      },
    });
  }

  const isTemplateEntry = (entry: KbEntry) => (
    (entry.category === 'reconcile' && entry.title.startsWith('file_template:'))
    || entry.category === 'report_template'
    || entry.category === 'report_instruction'
    || entry.category === 'knowledge_module'
  );
  const visibleEntries = filtered.filter((entry) => !isTemplateEntry(entry));
  const moduleEntryCount = entries.filter((entry) => moduleCategories.includes(entry.category) && !isTemplateEntry(entry)).length;
  const moduleTemplateCount = activeModule.id === 'finance' ? templateSummary.length + reportTemplates.length : 0;
  const showFinanceTools = activeModule.id === 'finance';

  return (
    <div className="flex-1 flex min-h-0 flex-col bg-slate-50 min-w-0">
      <div className="hidden px-5 py-3 border-b border-slate-200 bg-white shadow-sm md:flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-700">知识库</h2>
          <p className="mt-0.5 text-xs text-slate-400">按智能体栏目管理知识；对账模板和财务报表归属于财务模块。</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {showFinanceTools && (
              <Button
                onClick={() => setTemplateOpen(true)}
                className="h-auto px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer transition-colors"
              >
                上传对账模板
              </Button>
            )}
            <Button
              onClick={() => setModuleEditorOpen((open) => !open)}
              className="h-auto px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              添加栏目
            </Button>
            <Button
              onClick={() => setCategoryEditorOpen((open) => !open)}
              className="h-auto px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              添加类型
            </Button>
            <Button
              onClick={openCreate}
              className="h-auto px-3 py-1.5 rounded-xl text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 cursor-pointer transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              新增条目
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 border-b border-slate-200 bg-white px-3 py-3 md:px-5">
        {isAdmin && (
          <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
            {showFinanceTools && (
              <Button
                onClick={() => setTemplateOpen(true)}
                className="h-10 shrink-0 rounded-xl bg-emerald-500 px-3 text-xs font-medium text-white hover:bg-emerald-600 cursor-pointer transition-colors"
              >
                上传模板
              </Button>
            )}
            <Button
              onClick={() => setModuleEditorOpen((open) => !open)}
              className="h-10 shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              添加栏目
            </Button>
            <Button
              onClick={() => setCategoryEditorOpen((open) => !open)}
              className="h-10 shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              添加类型
            </Button>
            <Button
              onClick={openCreate}
              className="h-10 shrink-0 rounded-xl bg-blue-500 px-3 text-xs font-medium text-white hover:bg-blue-600 cursor-pointer transition-colors"
            >
              新增条目
            </Button>
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {modules.map((module) => {
            const active = module.id === activeModule.id;
            const count = entries.filter((entry) => module.categories.includes(entry.category) && !isTemplateEntry(entry)).length
              + (module.id === 'finance' ? templateSummary.length + reportTemplates.length : 0);
            return (
              <Button
                key={module.id}
                onClick={() => switchModule(module.id)}
                className={`h-auto min-w-[116px] rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer md:min-w-[132px] ${
                  active ? module.accent : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{module.label}</span>
                  <span className="text-[10px] opacity-70">{count}</span>
                </div>
                <p className="mt-1 text-[10px] leading-snug opacity-75 line-clamp-2">{module.description}</p>
              </Button>
            );
          })}
        </div>
        {moduleEditorOpen && isAdmin && (
          <div className="flex flex-col gap-2 rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2 sm:flex-row sm:items-center">
            <Input
              value={newModuleName}
              onChange={(e) => setNewModuleName(e.target.value)}
              placeholder="输入新栏目名称，例如：法务、采购、运营"
              className="flex-1 rounded-lg border border-cyan-100 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-100"
            />
            <Button
              onClick={handleAddModule}
              disabled={!newModuleName.trim()}
              className="h-10 rounded-lg bg-cyan-600 px-3 text-xs font-medium text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              保存栏目
            </Button>
          </div>
        )}
        {categoryEditorOpen && isAdmin && (
          <div className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 sm:flex-row sm:items-center">
            <div className="text-xs font-medium text-blue-700 sm:shrink-0">
              在「{activeModule.label}」中添加类型
            </div>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="输入新类型名称，例如：工资规则、门店映射、数据字段说明"
              className="flex-1 rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <Button
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim()}
              className="h-10 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              保存类型
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={`在${activeModule.label}知识中按标题/内容过滤`}
          className="w-full flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
        />
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[{ value: '', label: '本栏目全部类型' }, ...moduleCategoryOptions]}
          popupMatchSelectWidth={false}
          className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 cursor-pointer sm:min-w-40 sm:w-auto"
        />
        {isAdmin && categoryFilter && activeModule.categoryLabels?.[categoryFilter] && (
          <Button
            onClick={() => handleDeleteCategory(categoryFilter)}
            className="h-auto rounded-xl border border-red-100 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 cursor-pointer"
          >
            删除类型
          </Button>
        )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 md:px-5 md:py-4">
        {error && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600">{error}</div>
        )}
        {templateMessage && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">{templateMessage}</div>
        )}

        {isAdmin && (
          <div className="mb-4">
            <KnowledgeCandidatesPanel />
          </div>
        )}

        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">{activeModule.label}知识</h3>
              <p className="mt-1 text-xs text-slate-500">{activeModule.description}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2 text-[11px] text-slate-500">
              <span className="rounded-lg bg-slate-50 px-2 py-1">知识 {moduleEntryCount}</span>
              {moduleTemplateCount > 0 && <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">模板 {moduleTemplateCount}</span>}
            </div>
          </div>
        </div>

        {activeModule.id === 'hr' && (
          <div className="mb-4">
            <SalaryTemplatePanel isAdmin={isAdmin} />
          </div>
        )}

        {showFinanceTools && (
          <FinanceTemplatePanel
            isAdmin={isAdmin}
            templateSaving={templateSaving}
            readiness={readiness}
            reportTemplates={reportTemplates}
            reportTemplateDetails={reportTemplateDetails}
            globalInstructionOpen={globalInstructionOpen}
            setGlobalInstructionOpen={setGlobalInstructionOpen}
            globalInstructionText={globalInstructionText}
            setGlobalInstructionText={setGlobalInstructionText}
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
            handleFinanceProcessFile={handleFinanceProcessFile}
            handleGlobalReportInstructionFile={handleGlobalReportInstructionFile}
            handleReportTemplateFile={handleReportTemplateFile}
            handleCarryforwardSeedFile={handleCarryforwardSeedFile}
            handleGlobalReportInstructionText={handleGlobalReportInstructionText}
            toggleReportTemplateDetail={toggleReportTemplateDetail}
            handleDeleteReportTemplate={handleDeleteReportTemplate}
            handleTemplateInstructionFile={handleTemplateInstructionFile}
            handleTemplateInstructionText={handleTemplateInstructionText}
            handleUpdateInstruction={handleUpdateInstruction}
            handleDeleteInstruction={handleDeleteInstruction}
          />
        )}

        {showFinanceTools && (
          <ReconcileTemplateSection
            isAdmin={isAdmin}
            templateSaving={templateSaving}
            templateSummary={templateSummary}
            handleImportSeeds={handleImportSeeds}
            openEditTemplate={openEditTemplate}
            handleDeleteTemplate={handleDeleteTemplate}
          />
        )}

        <KnowledgeEntryList
          isAdmin={isAdmin}
          loading={loading}
          totalEntryCount={entries.length}
          visibleEntries={visibleEntries}
          expandedEntries={expandedEntries}
          toggleEntryExpanded={toggleEntryExpanded}
          displayCategoryLabel={displayCategoryLabel}
          openEdit={openEdit}
          handleDelete={handleDelete}
        />
      </div>

      {editorOpen && (
        <KnowledgeEntryEditor
          entry={editing}
          onClose={() => setEditorOpen(false)}
          onSave={handleSave}
          categories={editorCategories}
          defaultCategory={defaultEntryCategory}
        />
      )}

      {templateOpen && (
        <ReconcileTemplateDialog
          templateError={templateError}
          templateMessage={templateMessage}
          templateProvider={templateProvider}
          setTemplateProvider={setTemplateProvider}
          templateJson={templateJson}
          setTemplateJson={setTemplateJson}
          templateRules={templateRules}
          setTemplateRules={setTemplateRules}
          templateExcelFile={templateExcelFile}
          templateDrafting={templateDrafting}
          templateSaving={templateSaving}
          setTemplateOpen={setTemplateOpen}
          setTemplateError={setTemplateError}
          handleJsonTemplateFile={handleJsonTemplateFile}
          handleExcelTemplateFile={handleExcelTemplateFile}
          handleGenerateTemplate={handleGenerateTemplate}
          handleSaveTemplate={handleSaveTemplate}
          previewTemplate={previewTemplate}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title="确认操作"
          message={confirmDialog.message}
          confirmLabel="确认"
          onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
