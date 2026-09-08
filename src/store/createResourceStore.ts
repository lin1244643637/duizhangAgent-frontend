import { create } from 'zustand';
import { registerSessionCleanup } from '../api/sessionLifecycle';

/**
 * 共享参考数据的全局缓存 store 工厂（消息通道、员工通讯录等跨页复用的数据）。
 *
 * - 首拉一次、全局缓存：多页/多组件读同一份，不再各拉各的。
 * - 并发去重：同时调 load() 共用同一个请求，避免同接口并发打多次。
 * - 改后失效：增删改后 invalidate()，下次 load() 重拉，保证不脏读。
 */
export interface ResourceStore<T> {
  items: T[];
  loaded: boolean;
  loading: boolean;
  error: string;
  load: (force?: boolean) => Promise<T[]>;
  invalidate: () => void;
  reset: () => void;
}

export function createResourceStore<T>(fetcher: () => Promise<T[]>) {
  let inflight: Promise<T[]> | null = null;
  let generation = 0;
  const useStore = create<ResourceStore<T>>((set, get) => ({
    items: [],
    loaded: false,
    loading: false,
    error: '',
    load: async (force = false) => {
      if (!force && get().loaded) return get().items; // 命中缓存
      if (inflight) return inflight;                   // 并发去重
      const requestGeneration = generation;
      set({ loading: true, error: '' });
      inflight = fetcher()
        .then((items) => {
          if (requestGeneration === generation) set({ items, loaded: true, loading: false });
          return items;
        })
        .catch((e) => {
          if (requestGeneration === generation) set({ loading: false, error: (e as Error).message });
          throw e;
        })
        .finally(() => {
          if (requestGeneration === generation) inflight = null;
        });
      return inflight;
    },
    invalidate: () => { generation += 1; inflight = null; set({ loaded: false, loading: false }); },
    reset: () => { generation += 1; inflight = null; set({ items: [], loaded: false, loading: false, error: '' }); },
  }));
  registerSessionCleanup(() => useStore.getState().reset());
  return useStore;
}
