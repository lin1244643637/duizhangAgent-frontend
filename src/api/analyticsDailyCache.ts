import type {
  AnalyticsClientDayVersion,
  DailyFactDeltaResponse,
  DailyFactManifest,
  DailyFactRecord,
} from './analyticsDailyTypes';

const DB_NAME = 'duizhang-analytics-cache-v2';
const DB_VERSION = 1;
const DAILY_FACTS_STORE = 'dailyFacts';
const MANIFESTS_STORE = 'manifests';
const SOFT_USAGE_LIMIT_BYTES = 100 * 1024 * 1024;
const CORE_RETENTION_DAYS = 550;
const PRODUCT_RETENTION_DAYS = 90;
const DEFAULT_MAX_RECORDS = 20000;

export type DailyFactIdentity = {
  tenantId: string;
  userId: string;
  accessScopeHash: string;
  namespace: string;
  schemaVersion: string;
  paramsHash: string;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;
let dbFactoryRef: IDBFactory | null = null;

function indexedDBFactory(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    return null;
  }
}

function openDailyCacheDb(): Promise<IDBDatabase | null> {
  const factory = indexedDBFactory();
  if (!factory) return Promise.resolve(null);
  if (dbFactoryRef !== factory) {
    dbPromise = null;
    dbFactoryRef = factory;
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DAILY_FACTS_STORE)) db.createObjectStore(DAILY_FACTS_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(MANIFESTS_STORE)) db.createObjectStore(MANIFESTS_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbTransactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function deleteScopeRecords(store: IDBObjectStore, scopePrefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      if (typeof cursor.key === 'string' && cursor.key.startsWith(scopePrefix)) cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function keyPart(value: string): string {
  return encodeURIComponent(value);
}

function scopeKey(identity: DailyFactIdentity): string {
  return [
    identity.tenantId,
    identity.userId,
    identity.accessScopeHash,
    identity.namespace,
    identity.schemaVersion,
    identity.paramsHash,
  ].map(keyPart).join('|');
}

function recordKey(identity: DailyFactIdentity, date: string): string {
  return `${scopeKey(identity)}|${keyPart(date)}`;
}

function manifestKey(identity: DailyFactIdentity): string {
  return scopeKey(identity);
}

function identityFromDelta<T>(identity: DailyFactIdentity, delta: DailyFactDeltaResponse<T>): DailyFactIdentity {
  return {
    ...identity,
    namespace: delta.namespace || identity.namespace,
    schemaVersion: delta.schema_version || identity.schemaVersion,
    paramsHash: delta.params_hash || identity.paramsHash,
    accessScopeHash: delta.access_scope_hash || identity.accessScopeHash,
  };
}

function isDailyRecord(value: unknown): value is DailyFactRecord<unknown> & { key: string } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<DailyFactRecord<unknown>> & { key?: unknown };
  return typeof record.key === 'string'
    && typeof record.tenantId === 'string'
    && typeof record.namespace === 'string'
    && typeof record.date === 'string';
}

function cutoffDate(days: number, now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function productLike(namespace: string): boolean {
  return namespace.includes('product');
}

async function readAllDailyFactEntries(): Promise<Array<DailyFactRecord<unknown> & { key: string }>> {
  const db = await openDailyCacheDb();
  if (!db) return [];
  const tx = db.transaction(DAILY_FACTS_STORE, 'readonly');
  const store = tx.objectStore(DAILY_FACTS_STORE);
  const entries = await new Promise<Array<DailyFactRecord<unknown> & { key: string }>>((resolve, reject) => {
    const rows: Array<DailyFactRecord<unknown> & { key: string }> = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(rows);
        return;
      }
      if (isDailyRecord(cursor.value)) rows.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  await idbTransactionDone(tx);
  return entries;
}

export function buildClientDays(records: Pick<DailyFactRecord<unknown>, 'date' | 'version'>[]): AnalyticsClientDayVersion[] {
  return records.map((record) => ({ date: record.date, version: record.version }));
}

export async function readDailyFacts<T>(
  identity: DailyFactIdentity,
  dates: string[],
): Promise<DailyFactRecord<T>[]> {
  const db = await openDailyCacheDb();
  if (!db || dates.length === 0) return [];
  const tx = db.transaction(DAILY_FACTS_STORE, 'readonly');
  const store = tx.objectStore(DAILY_FACTS_STORE);
  const records: DailyFactRecord<T>[] = [];
  for (const date of dates) {
    const value = await idbRequest<(DailyFactRecord<T> & { key: string }) | undefined>(
      store.get(recordKey(identity, date)),
    );
    if (value) records.push(value);
  }
  await idbTransactionDone(tx);
  return records;
}

export async function readDailyManifest(identity: DailyFactIdentity): Promise<DailyFactManifest | null> {
  const db = await openDailyCacheDb();
  if (!db) return null;
  const tx = db.transaction(MANIFESTS_STORE, 'readonly');
  const value = await idbRequest<(DailyFactManifest & { key: string }) | undefined>(
    tx.objectStore(MANIFESTS_STORE).get(manifestKey(identity)),
  );
  await idbTransactionDone(tx);
  if (!value) return null;
  const { key: _key, ...manifest } = value;
  return manifest;
}

export async function applyDailyDelta<T>(
  identity: DailyFactIdentity,
  delta: DailyFactDeltaResponse<T>,
  aliasIdentity: DailyFactIdentity = identity,
): Promise<void> {
  const db = await openDailyCacheDb();
  if (!db) return;
  const now = new Date().toISOString();
  const effectiveIdentity = identityFromDelta(identity, delta);
  const effectiveScopeKey = scopeKey(effectiveIdentity);
  const tx = db.transaction([DAILY_FACTS_STORE, MANIFESTS_STORE], 'readwrite');
  const factsStore = tx.objectStore(DAILY_FACTS_STORE);
  const manifestsStore = tx.objectStore(MANIFESTS_STORE);

  if (delta.reset_required) {
    await deleteScopeRecords(factsStore, `${scopeKey(identity)}|`);
    if (scopeKey(identity) !== effectiveScopeKey) {
      manifestsStore.delete(manifestKey(identity));
    }
  }
  if (delta.reset_required && scopeKey(identity) !== effectiveScopeKey) {
    await deleteScopeRecords(factsStore, `${effectiveScopeKey}|`);
  }

  for (const changed of delta.changed_days) {
    const record: DailyFactRecord<T> & { key: string } = {
      ...effectiveIdentity,
      key: recordKey(effectiveIdentity, changed.date),
      date: changed.date,
      version: changed.version,
      payload: changed.payload,
      completeness: changed.completeness,
      savedAt: now,
      lastAccessedAt: now,
    };
    factsStore.put(record);
  }
  for (const date of delta.deleted_days) {
    factsStore.delete(recordKey(effectiveIdentity, date));
  }
  manifestsStore.put({
    ...effectiveIdentity,
    key: manifestKey(effectiveIdentity),
    dateFrom: delta.date_from,
    dateTo: delta.date_to,
    updatedAt: now,
  } satisfies DailyFactManifest & { key: string });
  if (manifestKey(aliasIdentity) !== manifestKey(effectiveIdentity)) {
    manifestsStore.put({
      ...effectiveIdentity,
      key: manifestKey(aliasIdentity),
      dateFrom: delta.date_from,
      dateTo: delta.date_to,
      updatedAt: now,
    } satisfies DailyFactManifest & { key: string });
  }
  await idbTransactionDone(tx);
}

export async function clearTenantDailyFacts(tenantId: string): Promise<void> {
  const db = await openDailyCacheDb();
  if (!db) return;
  const tx = db.transaction([DAILY_FACTS_STORE, MANIFESTS_STORE], 'readwrite');
  const stores = [tx.objectStore(DAILY_FACTS_STORE), tx.objectStore(MANIFESTS_STORE)];
  for (const store of stores) {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const value = cursor.value as { tenantId?: string } | null;
      if (value?.tenantId === tenantId) cursor.delete();
      cursor.continue();
    };
  }
  await idbTransactionDone(tx);
}

export async function pruneDailyFacts(maxRecords = DEFAULT_MAX_RECORDS, now = new Date()): Promise<number> {
  const db = await openDailyCacheDb();
  if (!db) return 0;
  const entries = await readAllDailyFactEntries();
  const coreCutoff = cutoffDate(CORE_RETENTION_DAYS, now);
  const productCutoff = cutoffDate(PRODUCT_RETENTION_DAYS, now);
  const expiredKeys = entries
    .filter((entry) => {
      const cutoff = productLike(entry.namespace) ? productCutoff : coreCutoff;
      return entry.date < cutoff;
    })
    .map((entry) => entry.key);

  let usageOverLimit = false;
  try {
    usageOverLimit = Boolean(navigator.storage && (await navigator.storage.estimate()).usage! > SOFT_USAGE_LIMIT_BYTES);
  } catch {
    usageOverLimit = false;
  }

  const retainedAfterExpiry = entries.filter((entry) => !expiredKeys.includes(entry.key));
  const overflow = Math.max(0, retainedAfterExpiry.length - maxRecords);
  const overflowKeys = (usageOverLimit || overflow > 0)
    ? retainedAfterExpiry
      .sort((a, b) => (
        Number(productLike(b.namespace)) - Number(productLike(a.namespace))
        || Date.parse(a.lastAccessedAt) - Date.parse(b.lastAccessedAt)
        || a.key.localeCompare(b.key)
      ))
      .slice(0, Math.max(overflow, usageOverLimit ? Math.ceil(retainedAfterExpiry.length * 0.1) : 0))
      .map((entry) => entry.key)
    : [];
  const keysToDelete = [...new Set([...expiredKeys, ...overflowKeys])];
  if (!keysToDelete.length) return 0;

  const tx = db.transaction(DAILY_FACTS_STORE, 'readwrite');
  const store = tx.objectStore(DAILY_FACTS_STORE);
  keysToDelete.forEach((key) => store.delete(key));
  await idbTransactionDone(tx);
  return keysToDelete.length;
}
