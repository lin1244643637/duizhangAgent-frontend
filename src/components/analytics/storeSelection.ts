export function selectedStoreKeys(keys: string[]): string[] {
  return [...new Set(keys.filter(key => key && key !== 'ALL'))];
}

export function normalizeStoreSelection(previous: string[], next: string[]): string[] {
  const values = [...new Set(next.filter(Boolean))];
  if (values.length === 0) return ['ALL'];
  const selectedAll = values.includes('ALL');
  if (selectedAll && !previous.includes('ALL')) return ['ALL'];
  const stores = selectedStoreKeys(values);
  return stores.length ? stores : ['ALL'];
}

export function isStoreComparison(keys: string[]): boolean {
  return selectedStoreKeys(keys).length > 1;
}
