/** 共享资源 store 工厂：缓存命中、并发去重、失效重拉。 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceStore } from './createResourceStore';

describe('createResourceStore', () => {
  let fetcher: ReturnType<typeof vi.fn>;
  let useStore: ReturnType<typeof createResourceStore<number>>;

  beforeEach(() => {
    fetcher = vi.fn().mockResolvedValue([1, 2, 3]);
    useStore = createResourceStore<number>(fetcher);
  });

  it('首拉一次后命中缓存，不再请求', async () => {
    const items = await useStore.getState().load();
    expect(items).toEqual([1, 2, 3]);
    expect(useStore.getState().items).toEqual([1, 2, 3]);
    await useStore.getState().load();
    await useStore.getState().load();
    expect(fetcher).toHaveBeenCalledTimes(1);   // 缓存命中
  });

  it('并发 load 共用同一请求（去重）', async () => {
    await Promise.all([useStore.getState().load(), useStore.getState().load(), useStore.getState().load()]);
    expect(fetcher).toHaveBeenCalledTimes(1);    // in-flight 去重
  });

  it('invalidate 后下次 load 重新请求', async () => {
    await useStore.getState().load();
    useStore.getState().invalidate();
    await useStore.getState().load();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('force=true 跳过缓存强制重拉', async () => {
    await useStore.getState().load();
    await useStore.getState().load(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('请求失败记录 error，不污染 loaded', async () => {
    fetcher.mockRejectedValueOnce(new Error('boom'));
    await expect(useStore.getState().load()).rejects.toThrow('boom');
    expect(useStore.getState().loaded).toBe(false);
    expect(useStore.getState().error).toBe('boom');
    // 失败后可重试成功
    await useStore.getState().load();
    expect(useStore.getState().items).toEqual([1, 2, 3]);
  });
});
