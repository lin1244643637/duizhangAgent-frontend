import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DailyFactDeltaResponse } from './analyticsDailyTypes';
import {
  applyDailyDelta,
  buildClientDays,
  clearTenantDailyFacts,
  pruneDailyFacts,
  readDailyFacts,
  readDailyManifest,
} from './analyticsDailyCache';

type TestPayload = { value: number; stores?: string[] };

const identity = {
  tenantId: 'tenant-a',
  userId: 'admin-a',
  accessScopeHash: 'scope-admin',
  namespace: 'revenue-trend',
  schemaVersion: 'v1',
  paramsHash: 'params-all',
};

function delta(
  patch: Partial<DailyFactDeltaResponse<TestPayload>>,
): DailyFactDeltaResponse<TestPayload> {
  return {
    namespace: identity.namespace,
    schema_version: identity.schemaVersion,
    date_from: '2026-08-01',
    date_to: '2026-08-02',
    params_hash: identity.paramsHash,
    access_scope_hash: identity.accessScopeHash,
    reset_required: false,
    unchanged_days: [],
    changed_days: [],
    deleted_days: [],
    cache_meta: {
      status: 'partial',
      server_checked_days: 2,
      returned_days: 0,
      deleted_days: 0,
    },
    ...patch,
  };
}

function installFakeIndexedDB() {
  const stores = new Map<string, Map<IDBValidKey, unknown>>();

  function store(name: string) {
    let target = stores.get(name);
    if (!target) {
      target = new Map<IDBValidKey, unknown>();
      stores.set(name, target);
    }
    return target;
  }

  function request<T>(value: T): IDBRequest<T> {
    const req = {
      result: undefined as T,
      error: null,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
    };
    queueMicrotask(() => {
      req.result = value;
      req.onsuccess?.(new Event('success'));
    });
    return req as IDBRequest<T>;
  }

  const db = {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore: vi.fn((name: string) => {
      store(name);
      return {};
    }),
    transaction: (storeNames: string | string[]) => {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      let completeScheduled = false;
      const tx = {
        error: null,
        oncomplete: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: (name: string) => {
          if (!names.includes(name)) throw new Error(`store ${name} not in transaction`);
          const entries = store(name);
          const complete = () => {
            if (completeScheduled) return;
            completeScheduled = true;
            setTimeout(() => tx.oncomplete?.(new Event('complete')), 0);
          };
          return {
            get: (key: IDBValidKey) => {
              complete();
              return request(entries.get(key));
            },
            put: (value: { key?: IDBValidKey }, key?: IDBValidKey) => {
              const finalKey = key ?? value.key;
              if (finalKey === undefined) throw new Error('missing key');
              entries.set(finalKey, value);
              complete();
              return request(finalKey);
            },
            delete: (key: IDBValidKey) => {
              entries.delete(key);
              complete();
              return request(undefined);
            },
            openCursor: () => {
              const keys = Array.from(entries.keys());
              let index = 0;
              const req = {
                result: null as IDBCursorWithValue | null,
                error: null,
                onsuccess: null as ((event: Event) => void) | null,
                onerror: null as ((event: Event) => void) | null,
              };
              const fire = () => {
                const key = keys[index];
                if (key === undefined) {
                  req.result = null;
                  req.onsuccess?.(new Event('success'));
                  complete();
                  return;
                }
                req.result = {
                  key,
                  value: entries.get(key),
                  continue: () => {
                    index += 1;
                    queueMicrotask(fire);
                  },
                  delete: () => {
                    entries.delete(key);
                    return request(undefined);
                  },
                } as IDBCursorWithValue;
                req.onsuccess?.(new Event('success'));
              };
              queueMicrotask(fire);
              return req as IDBRequest<IDBCursorWithValue | null>;
            },
          };
        },
      };
      return tx as unknown as IDBTransaction;
    },
  };

  vi.stubGlobal('indexedDB', {
    open: () => {
      const req = {
        result: db,
        error: null,
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onblocked: null as ((event: Event) => void) | null,
      };
      queueMicrotask(() => {
        req.onupgradeneeded?.();
        req.onsuccess?.(new Event('success'));
      });
      return req as unknown as IDBOpenDBRequest;
    },
  });

  return stores;
}

describe('analyticsDailyCache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installFakeIndexedDB();
  });

  it('replaces only changed days and deletes explicit tombstones atomically', async () => {
    await applyDailyDelta<TestPayload>(identity, delta({
      changed_days: [
        { date: '2026-08-01', version: 'v1', payload: { value: 1 } },
        { date: '2026-08-02', version: 'v1', payload: { value: 2 } },
      ],
    }));

    await applyDailyDelta<TestPayload>(identity, delta({
      changed_days: [{ date: '2026-08-01', version: 'v2', payload: { value: 3 } }],
      deleted_days: ['2026-08-02'],
    }));

    const records = await readDailyFacts<TestPayload>(identity, ['2026-08-01', '2026-08-02']);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      date: '2026-08-01',
      version: 'v2',
      payload: { value: 3 },
    });
    expect(buildClientDays(records)).toEqual([{ date: '2026-08-01', version: 'v2' }]);
    await expect(readDailyManifest(identity)).resolves.toMatchObject({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-02',
    });
  });

  it('isolates records by user and access scope inside the same tenant', async () => {
    await applyDailyDelta<TestPayload>(identity, delta({
      changed_days: [{ date: '2026-08-01', version: 'admin-v1', payload: { value: 2, stores: ['A', 'B'] } }],
    }));

    const memberBeforeHandshake = {
      ...identity,
      userId: 'member-b',
      accessScopeHash: 'scope-pending',
    };
    await expect(readDailyFacts<TestPayload>(memberBeforeHandshake, ['2026-08-01'])).resolves.toEqual([]);

    const memberAfterHandshake = {
      ...identity,
      userId: 'member-b',
      accessScopeHash: 'scope-store-b',
    };
    await applyDailyDelta<TestPayload>(memberAfterHandshake, delta({
      access_scope_hash: 'scope-store-b',
      changed_days: [{ date: '2026-08-01', version: 'member-v1', payload: { value: 1, stores: ['B'] } }],
    }));

    await expect(readDailyFacts<TestPayload>(memberAfterHandshake, ['2026-08-01'])).resolves.toMatchObject([
      { version: 'member-v1', payload: { stores: ['B'] } },
    ]);
    await expect(readDailyFacts<TestPayload>(identity, ['2026-08-01'])).resolves.toMatchObject([
      { version: 'admin-v1', payload: { stores: ['A', 'B'] } },
    ]);
  });

  it('keeps changed days written during a scoped reset', async () => {
    await applyDailyDelta<TestPayload>(identity, delta({
      changed_days: [{ date: '2026-08-01', version: 'v1', payload: { value: 1 } }],
    }));

    await applyDailyDelta<TestPayload>(identity, delta({
      reset_required: true,
      changed_days: [{ date: '2026-08-01', version: 'v2', payload: { value: 2 } }],
    }));

    await expect(readDailyFacts<TestPayload>(identity, ['2026-08-01'])).resolves.toMatchObject([
      { version: 'v2', payload: { value: 2 } },
    ]);
  });

  it('removes the previous access scope and updates the stable manifest alias on reset', async () => {
    const baseIdentity = { ...identity, accessScopeHash: 'pending' };
    const oldIdentity = { ...identity, accessScopeHash: 'scope-old' };
    const newIdentity = { ...identity, accessScopeHash: 'scope-new' };
    await applyDailyDelta<TestPayload>(oldIdentity, delta({
      access_scope_hash: 'scope-old',
      changed_days: [{ date: '2026-08-01', version: 'old-v1', payload: { value: 1 } }],
    }), baseIdentity);

    await applyDailyDelta<TestPayload>(oldIdentity, delta({
      access_scope_hash: 'scope-new',
      reset_required: true,
      changed_days: [{ date: '2026-08-01', version: 'new-v1', payload: { value: 2 } }],
    }), baseIdentity);

    await expect(readDailyFacts<TestPayload>(oldIdentity, ['2026-08-01'])).resolves.toEqual([]);
    await expect(readDailyFacts<TestPayload>(newIdentity, ['2026-08-01'])).resolves.toMatchObject([
      { version: 'new-v1', payload: { value: 2 } },
    ]);
    await expect(readDailyManifest(baseIdentity)).resolves.toMatchObject({ accessScopeHash: 'scope-new' });
    await expect(readDailyManifest(oldIdentity)).resolves.toBeNull();
  });

  it('clears tenant daily facts without touching other tenants', async () => {
    await applyDailyDelta<TestPayload>(identity, delta({
      changed_days: [{ date: '2026-08-01', version: 'v1', payload: { value: 1 } }],
    }));
    const otherTenant = { ...identity, tenantId: 'tenant-b' };
    await applyDailyDelta<TestPayload>(otherTenant, delta({
      changed_days: [{ date: '2026-08-01', version: 'v1', payload: { value: 9 } }],
    }));

    await clearTenantDailyFacts('tenant-a');

    await expect(readDailyFacts<TestPayload>(identity, ['2026-08-01'])).resolves.toEqual([]);
    await expect(readDailyFacts<TestPayload>(otherTenant, ['2026-08-01'])).resolves.toMatchObject([
      { payload: { value: 9 } },
    ]);
  });

  it('retains the core history needed by the default monthly MA12 view', async () => {
    await applyDailyDelta<TestPayload>(identity, delta({
      changed_days: [{ date: '2025-04-01', version: 'v1', payload: { value: 1 } }],
    }));

    await pruneDailyFacts(20000, new Date('2026-08-12T00:00:00.000Z'));

    await expect(readDailyFacts<TestPayload>(identity, ['2025-04-01'])).resolves.toMatchObject([
      { date: '2025-04-01', payload: { value: 1 } },
    ]);
  });
});
