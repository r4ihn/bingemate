import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // The suite uses the mock data as its backend. Ignore a developer's .env.local mock and role
    // settings so tests behave the same on every machine and in CI.
    env: { VITE_USE_MOCKS: '', VITE_MOCK_ROLE: '' },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
