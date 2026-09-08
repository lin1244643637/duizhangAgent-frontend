import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8010'
  const publicBasePath = env.VITE_PUBLIC_BASE_PATH || '/'

  return {
    base: publicBasePath,
    plugins: [
      react(),
      compression({ algorithm: 'gzip' }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            marked: ['marked'],
            zustand: ['zustand'],
          },
        },
      },
    },
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
