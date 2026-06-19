import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001/stockroomnj-10e7d/us-central1/api',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
        shop: resolve(import.meta.dirname, 'shop.html'),
        legal: resolve(import.meta.dirname, 'legal.html'),
      },
    },
  },
})
