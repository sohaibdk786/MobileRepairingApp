import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// Dev server proxies API calls straight to the FastAPI backend (must be
// running separately on :8000, same as always) -- this means every fetch
// call in the app can just use a relative path like "/api/repairs" and
// work identically in dev (proxied) and in production (same origin, once
// FastAPI serves this app's own build output via DROPFIX_FRONTEND=react).
// No "which URL am I on" branching needed anywhere in the app code.
//
// Override backend target with VITE_API_PROXY_TARGET if needed, e.g.
// VITE_API_PROXY_TARGET=http://127.0.0.1:8001
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8001'
  const proxy = {
    '/api': apiTarget,
    '/receipts': apiTarget,
    '/track': apiTarget,
    '/shop': apiTarget,
    '/phone-images': apiTarget,
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: {
      port: 4173,
      strictPort: true,
      proxy,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
