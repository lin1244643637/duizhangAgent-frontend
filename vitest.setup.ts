/** vitest 环境垫片：当前 vitest+jsdom 组合不暴露 localStorage，补一个内存实现。 */

if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  const localStorageShim: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(window, 'localStorage', { value: localStorageShim, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageShim, configurable: true });
}

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserverShim implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserverShim, configurable: true });
  Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverShim, configurable: true });
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
    configurable: true,
  });
}

if (typeof window !== 'undefined' && window.getComputedStyle) {
  const getComputedStyle = window.getComputedStyle.bind(window);
  Object.defineProperty(window, 'getComputedStyle', {
    value: (element: Element, pseudoElement?: string | null) => {
      if (pseudoElement) return getComputedStyle(element);
      try {
        return getComputedStyle(element, pseudoElement);
      } catch {
        return getComputedStyle(element);
      }
    },
    configurable: true,
  });
}
