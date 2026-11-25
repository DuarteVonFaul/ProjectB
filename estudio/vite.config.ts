import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export const API_PORT = 5175;

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5174,
    proxy: {
      '/api': `http://127.0.0.1:${API_PORT}`,
      '/arquivos': `http://127.0.0.1:${API_PORT}`,
      '/audio': `http://127.0.0.1:${API_PORT}`,
      '/amostra': `http://127.0.0.1:${API_PORT}`,
      '/exportacoes': `http://127.0.0.1:${API_PORT}`,
      '/sons': `http://127.0.0.1:${API_PORT}`,
    },
  },
  test: { root: '.', include: ['tests/**/*.test.ts'] },
} as any);
