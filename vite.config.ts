import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Read the single source-of-truth .env (repo root). Only VITE_-prefixed vars
  // are exposed to the client bundle; API_PORT is used here (build-time) just to
  // point the dev proxy at the local API.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = `http://localhost:${env.API_PORT || '3001'}`;

  return {
    plugins: [react()],
    server: {
      // Bind to all network interfaces so the app is reachable via the LAN IP
      // (http://172.16.78.27:5173), not just localhost.
      host: true,
      port: 5173,
      // Same-origin dev: forward backend routes to the local API, mirroring how
      // IIS reverse-proxies them in production. Keeps the frontend URL-agnostic.
      proxy: {
        '/api': apiTarget,
        '/health': apiTarget,
        '/storage': apiTarget,
        // Same-origin document file server (tools/file-server on :4000), mirroring
        // the IIS ProxyToFileServer rule in prod. Strip the /files prefix so
        // /files/upload -> http://localhost:4000/upload.
        '/files': {
          target: `http://localhost:${env.FILE_SERVER_PORT || '4000'}`,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/files/, ''),
        },
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    build: {
      // Raise the warning ceiling — every remaining large chunk is lazy-loaded on
      // demand (AdminStudio only in /admin, echarts only when a dashboard opens,
      // xlsx only on import/export), so none of them block initial paint.
      //
      // echarts is imported via echarts/core in VisualRenderer with only the chart
      // types/components the dashboards use registered (echarts.use([...])), which
      // trims that shared chunk from ~1.3MB to ~820KB. The single chunk still above
      // 900KB is AdminStudio (~1.4MB) — an inherently large, admin-only lazy route;
      // splitting it further is over-engineering for a bundle regular users never load.
      //
      // We deliberately do NOT use manualChunks here. The app's lazy-import
      // boundaries (AdminStudio, DashboardViewer, the import modal, and the dynamic
      // import('xlsx') in xlsxExport) already let Rollup split echarts/xlsx/admin
      // into separate chunks attributed to those lazy routes. Forcing named vendor
      // chunks instead made Rollup hoist a heavy library into the entry's
      // modulepreload, downloading it eagerly for every user — the opposite of what
      // we want.
      chunkSizeWarningLimit: 1450,
    },
  };
});
