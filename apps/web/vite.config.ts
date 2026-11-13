import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * GitHub Pages project sites are served from /<repo>/, so the base path is injected at build
 * time (VITE_BASE_PATH=/<repo>/). Production builds default to /Mini-Games/ (see below).
 * Routing uses the hash (#/...) so no server rewrites are needed.
 */
export default defineConfig(({ command, isPreview }) => ({
  // Production builds target https://trazhub.github.io/Mini-Games/. Override with VITE_BASE_PATH
  // (e.g. for a fork). Local dev serves from "/".
  base: process.env.VITE_BASE_PATH ?? (command === 'build' || isPreview ? '/Mini-Games/' : '/'),
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          if (id.includes('node_modules/@colyseus') || id.includes('node_modules/msgpackr')) return 'colyseus';
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) return 'react';
          return undefined;
        },
      },
    },
  },
}));
