import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,  // 让 @testing-library/react 的 afterEach 自动 cleanup 生效

    environmentOptions: {
      jsdom: { url: 'http://localhost' },  // 默认 about:blank 是不透明 origin，localStorage 不可用
    },
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
