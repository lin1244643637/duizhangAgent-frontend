import { Tree, TreeSelect } from 'antd';
import { normalizeScopeKeys, type StoreScopeNode } from './storeScope';

type Props = {
  nodes: StoreScopeNode[];
  value: string[];
  onChange: (value: string[]) => void;
  fullscreen?: boolean;
  ariaLabel: string;
};

type TreeItem = {
  key: string;
  value: string;
  title: string;
  children?: TreeItem[];
};

const toTreeData = (nodes: StoreScopeNode[]): TreeItem[] => nodes.map(node => ({
  key: node.key,
  value: node.key,
  title: node.label,
  children: node.children?.length ? toTreeData(node.children) : undefined,
}));

function scopeKeysFromValue(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => {
    if (typeof item === 'string' || typeof item === 'number') return [String(item)];
    if (item && typeof item === 'object' && 'value' in item) return [String(item.value)];
    return [];
  });
}

export function StoreScopePicker({ nodes, value, onChange, fullscreen = false, ariaLabel }: Props) {
  const treeData = [{ key: 'ALL', value: 'ALL', title: '全部门店' }, ...toTreeData(nodes)];
  const labels = new Map(treeData.flatMap(function collect(item): Array<[string, string]> {
    return [[item.key, item.title], ...(item.children || []).flatMap(collect)];
  }));

  if (fullscreen) {
    return (
      <Tree
        aria-label={ariaLabel}
        checkable
        checkStrictly
        selectable={false}
        checkedKeys={value}
        treeData={treeData}
        className="max-h-56 overflow-y-auto bg-transparent [&_.ant-tree-title]:break-words"
        onCheck={(checkedKeys) => {
          const keys = Array.isArray(checkedKeys) ? checkedKeys : checkedKeys.checked;
          onChange(normalizeScopeKeys(value, scopeKeysFromValue(keys)));
        }}
      />
    );
  }

  return (
    <TreeSelect
      aria-label={ariaLabel}
      treeCheckable
      treeCheckStrictly
      showSearch={{
        filterTreeNode: (input, node) => String(node.title).toLowerCase().includes(input.toLowerCase()),
      }}
      showCheckedStrategy={TreeSelect.SHOW_ALL}
      value={value.map(key => ({ value: key, label: labels.get(key) || key }))}
      treeData={treeData}
      onChange={(keys) => onChange(normalizeScopeKeys(value, scopeKeysFromValue(keys)))}
      maxTagCount="responsive"
      popupMatchSelectWidth={false}
      className="w-full min-w-0 max-w-full"
    />
  );
}
