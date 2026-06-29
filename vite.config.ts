import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Raise the warning ceiling — the remaining large chunks (echarts, xlsx) are
    // now lazy-loaded on demand, so they no longer block initial paint.
    //
    // We deliberately do NOT use manualChunks here. The app's lazy-import
    // boundaries (AdminStudio, DashboardViewer, the import modal, and the dynamic
    // import('xlsx') in xlsxExport) already let Rollup split echarts/xlsx/admin
    // into separate chunks attributed to those lazy routes. Forcing named vendor
    // chunks instead made Rollup hoist a heavy library (echarts ≈385KB gzip) into
    // the entry's modulepreload, downloading it eagerly for every user — the exact
    // opposite of what we want.
    chunkSizeWarningLimit: 900,
  },
});
