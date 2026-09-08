import { Button, TreeSelect } from 'antd';
import type { ReactNode } from 'react';
import type { AutomationRecipientEmployee } from '../api/automation';

const UNASSIGNED_DEPARTMENT = '未同步部门';
const DEPARTMENT_NODE_PREFIX = 'department:';

type RecipientTreeNode = {
  title: ReactNode;
  label: string;
  value: string;
  key: string;
  searchText: string;
  children?: RecipientTreeNode[];
};

function employeeDepartments(employee: AutomationRecipientEmployee): string[] {
  const names = (employee.department_names || []).map(name => name.trim()).filter(Boolean);
  return names.length ? names : [UNASSIGNED_DEPARTMENT];
}

function primaryDepartment(employee: AutomationRecipientEmployee): string {
  return employeeDepartments(employee)[0];
}

function filterTreeNode(input: string, node: unknown): boolean {
  const keyword = input.trim().toLowerCase();
  if (!keyword) return true;
  const data = node as { searchText?: string; label?: string; value?: string };
  return [data.searchText, data.label, data.value]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(keyword);
}

export function EmployeeMultiSelect({
  employees,
  loading,
  selectedIds,
  onChange,
  placeholder = '搜索姓名、部门、职位或 userId',
}: {
  employees: AutomationRecipientEmployee[];
  loading: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const selectedEmployees = selectedIds
    .map(id => employees.find(employee => employee.ding_user_id === id))
    .filter(Boolean) as AutomationRecipientEmployee[];

  const departmentCounts = employees.reduce<Record<string, number>>((acc, employee) => {
    const department = primaryDepartment(employee);
    acc[department] = (acc[department] || 0) + 1;
    return acc;
  }, {});
  const departmentOptions = Object.keys(departmentCounts).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const groupedEmployees = employees.reduce<Record<string, AutomationRecipientEmployee[]>>((acc, employee) => {
    const department = primaryDepartment(employee);
    if (!acc[department]) acc[department] = [];
    acc[department].push(employee);
    return acc;
  }, {});
  const treeData: RecipientTreeNode[] = departmentOptions.map(department => {
    const items = groupedEmployees[department] || [];
    return {
      title: `${department}（${items.length}人）`,
      label: department,
      value: `${DEPARTMENT_NODE_PREFIX}${department}`,
      key: `${DEPARTMENT_NODE_PREFIX}${department}`,
      searchText: department,
      children: items.map(employee => ({
        title: (
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="font-medium text-slate-700">{employee.name}</span>
            <span className="truncate text-xs text-slate-400">
              {employeeDepartments(employee).join(' / ')}
              {employee.position ? ` · ${employee.position}` : ''}
              {' · '}
              {employee.ding_user_id}
            </span>
          </span>
        ),
        label: employee.name,
        value: employee.ding_user_id,
        key: employee.ding_user_id,
        searchText: [
          employee.name,
          employee.ding_user_id,
          employee.position,
          ...employeeDepartments(employee),
        ].filter(Boolean).join(' ').toLowerCase(),
      })),
    };
  });

  function removeSelected(id: string) {
    onChange(selectedIds.filter(item => item !== id));
  }

  function onTreeChange(value: string | string[]) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    onChange(values.filter(item => !item.startsWith(DEPARTMENT_NODE_PREFIX)));
  }

  if (loading) {
    return <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">正在加载员工通讯录...</div>;
  }

  if (employees.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        员工通讯录暂无可选人员。请先到「企业数据连接器」同步「钉钉员工通讯录」，同步完成后再回来选择接收人。
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-2 space-y-2">
        <TreeSelect
          className="w-full"
          value={selectedIds}
          onChange={onTreeChange}
          treeData={treeData}
          treeCheckable
	          allowClear
	          multiple
	          showSearch={{ treeNodeFilterProp: 'searchText', filterTreeNode }}
	          treeNodeLabelProp="label"
          showCheckedStrategy={TreeSelect.SHOW_CHILD}
          placeholder={placeholder}
          maxTagCount="responsive"
          listHeight={320}
          popupMatchSelectWidth={420}
          treeDefaultExpandedKeys={departmentOptions.slice(0, 1).map(department => `${DEPARTMENT_NODE_PREFIX}${department}`)}
          notFoundContent="没有匹配的员工"
          onClear={() => onChange([])}
        />
        <div className="text-xs text-slate-400">
          共 {employees.length} 人，{departmentOptions.length} 个部门；可展开部门选择，也可直接搜索姓名、部门、职位或 userId。
        </div>
        <div className="flex flex-wrap gap-1">
          {selectedEmployees.length === 0 ? (
            <span className="text-xs text-slate-400">未选择接收人</span>
          ) : selectedEmployees.map(employee => (
	            <Button autoInsertSpace={false}
	              key={employee.ding_user_id}
	              htmlType="button"
	              onClick={() => removeSelected(employee.ding_user_id)}
	              className="h-auto rounded-full border-0 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 shadow-none hover:bg-blue-100 cursor-pointer"
	              title="点击移除"
	            >
	              {employee.name} ×
	            </Button>
          ))}
        </div>
        {selectedIds.length > 0 && (
          <div className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">
            已填入 userId：{selectedIds.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
