import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    // In development the browser calls /api/* on the Vite server, which forwards to NestJS.
    // Same-origin requests keep cookie-based refresh tokens simple.
    // Browser tests point this at a separate test API via VITE_API_PROXY_TARGET.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
