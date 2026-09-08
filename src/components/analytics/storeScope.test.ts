import { describe, expect, it } from 'vitest';
import { normalizeScopeKeys, resolveStoreScopeSelection } from './storeScope';
import type { StoreScopeNode } from './storeScope';

const tree: StoreScopeNode[] = [
  {
    key: 'dept:1',
    type: 'department',
    label: '运营部',
    department_id: '1',
    children: [
      {
        key: 'dept:11',
        type: 'department',
        label: '事业1部',
        department_id: '11',
        children: [
          {
            key: 'dept:111',
            type: 'department',
            label: '凤八店',
            department_id: '111',
            children: [{ key: 'shop:801', type: 'store', label: '凤八店', store_key: '801', department_id: '111' }],
          },
          {
            key: 'dept:112',
            type: 'department',
            label: '凤九店',
            department_id: '112',
            children: [{ key: 'shop:802', type: 'store', label: '凤九店', store_key: '802', department_id: '112' }],
          },
        ],
      },
    ],
  },
];

describe('store scope', () => {
  it('expands parent departments as one aggregate scope', () => {
    const result = resolveStoreScopeSelection(['dept:11'], tree);

    expect(result.shopKeys).toEqual(['801', '802']);
    expect(result.departmentKeys).toEqual(['111', '112']);
    expect(result.compareStores).toBe(false);
    expect(result.label).toBe('事业1部');
  });

  it('compares only explicitly selected store leaves', () => {
    const result = resolveStoreScopeSelection(['shop:801', 'shop:802'], tree);

    expect(result.shopKeys).toEqual(['801', '802']);
    expect(result.scopes).toEqual([
      { key: 'shop:801', label: '凤八店', storeKeys: ['801'], departmentKeys: ['111'] },
      { key: 'shop:802', label: '凤九店', storeKeys: ['802'], departmentKeys: ['112'] },
    ]);
    expect(result.compareStores).toBe(true);
    expect(result.label).toBe('2 家门店');
  });

  it('keeps explicitly selected parent and child scopes independent', () => {
    const result = resolveStoreScopeSelection(['dept:11', 'shop:801'], tree);

    expect(result.scopes).toEqual([
      { key: 'dept:11', label: '事业1部', storeKeys: ['801', '802'], departmentKeys: ['111', '112'] },
      { key: 'shop:801', label: '凤八店', storeKeys: ['801'], departmentKeys: ['111'] },
    ]);
    expect(result.shopKeys).toEqual(['801', '802']);
  });

  it('compares single-store departments returned by the desktop tree picker', () => {
    const result = resolveStoreScopeSelection(['dept:111', 'dept:112'], tree);

    expect(result.shopKeys).toEqual(['801', '802']);
    expect(result.compareStores).toBe(true);
    expect(result.label).toBe('2 家门店');
  });

  it('keeps ALL exclusive and removes duplicate descendants', () => {
    expect(normalizeScopeKeys(['dept:11'], ['ALL', 'dept:11'])).toEqual(['ALL']);
    expect(normalizeScopeKeys(['ALL'], ['ALL', 'dept:11'])).toEqual(['dept:11']);
    expect(resolveStoreScopeSelection(['dept:11', 'shop:801'], tree).shopKeys).toEqual(['801', '802']);
  });

  it('uses the all-store aggregate for an empty or ALL selection', () => {
    expect(resolveStoreScopeSelection([], tree)).toEqual({
      scopeKeys: ['ALL'],
      scopes: [],
      shopKeys: [],
      departmentKeys: [],
      compareStores: false,
      label: '全部门店',
    });
    expect(resolveStoreScopeSelection(['ALL', 'shop:801'], tree).scopeKeys).toEqual(['ALL']);
  });

  it('resolves backend ungrouped nodes without treating them as store comparisons', () => {
    const ungrouped: StoreScopeNode[] = [{
      key: 'ungrouped',
      type: 'ungrouped',
      label: '未分组门店',
      children: [{ key: 'shop:999', type: 'store', label: '新店', store_key: '999' }],
    }];

    expect(resolveStoreScopeSelection(['ungrouped'], ungrouped)).toMatchObject({
      shopKeys: ['999'],
      compareStores: false,
      label: '新店',
    });
  });
});
