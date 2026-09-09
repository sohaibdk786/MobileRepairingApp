import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Dev server proxies API calls straight to the FastAPI backend (must be
// running separately on :8000, same as always) -- this means every fetch
// call in the app can just use a relative path like "/api/repairs" and
// work identically in dev (proxied) and in production (same origin, once
// FastAPI serves this app's own build output). No "which URL am I on"
// branching needed anywhere in the app code.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/receipts': 'http://127.0.0.1:8000',
    },
  },
  build: {
    outDir: 'dist',
  },
})
