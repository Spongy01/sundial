import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  build: {
    // Extension pages load chunks from the package itself; no polyfill (and no fetch) needed.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { dashboard: 'src/dashboard/index.html' },
    },
  },
  server: { cors: { origin: [/chrome-extension:\/\//] } },
});
