import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// GitHub Pages serves from /<repo>/ — base is set via env at build time so the
// repo can be renamed without touching code. Local dev uses '/'.
export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BASE ?? '/',
  resolve: {
    alias: {
      '@game': r('./src/game'),
      '@ui': r('./src/ui'),
      '@data': r('./data'),
    },
  },
  server: {
    host: true, // expose on LAN so the user can test from other devices
    port: 8300,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
