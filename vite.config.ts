import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'vite-plugin-javascript-obfuscator';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Read the single source-of-truth .env (repo root). Only VITE_-prefixed vars
  // are exposed to the client bundle; API_PORT is used here (build-time) just to
  // point the dev proxy at the local API.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = `http://localhost:${env.API_PORT || '3001'}`;

  return {
    plugins: [
      react(),
      // Production-only source protection. `apply: 'build'` means this NEVER runs
      // during `vite` (dev), so dev stays normal and fast — obfuscation happens
      // only on `npm run build`. Scoped to our own /src code; node_modules is
      // excluded so we don't re-obfuscate (and bloat/break) third-party deps.
      // Settings per the project security policy (see CLAUDE.md > Frontend build
      // protection): control-flow flattening and dead-code injection stay OFF to
      // keep bundle size and runtime cost reasonable.
      obfuscator({
        apply: 'build',
        include: ['src/**/*.js', 'src/**/*.ts', 'src/**/*.jsx', 'src/**/*.tsx'],
        exclude: [/node_modules/],
        options: {
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          selfDefending: true,
          renameGlobals: false,
          stringArray: true,
          stringArrayEncoding: ['base64'],
          stringArrayThreshold: 0.75,
          // CRITICAL: keep dynamic-import specifiers OUT of the string array.
          // This plugin obfuscates each module BEFORE Rollup bundles. If the
          // string `'./app/CrmApp'` in `import('./app/CrmApp')` were extracted
          // into the string array (import(_0x123(0x5))), Rollup could no longer
          // statically see the lazy-import target and would drop the whole
          // lazy subtree — collapsing our 180+ code-split chunks into one and
          // breaking every lazy route at runtime. Reserving module-path strings
          // (relative `./`/`../` specifiers, plus the one bare specifier we
          // dynamically import: `xlsx`) leaves those literals intact so Rollup's
          // code-splitting survives.
          //
          // NOTE for future work: any NEW bare-specifier dynamic import
          // (e.g. `import('some-lib')`) must be added here, or it will silently
          // fall out of code-splitting. Relative (`./`) dynamic imports are
          // already covered by the first pattern.
          reservedStrings: ['^\\.\\.?/', '^xlsx$'],
        },
      }),
    ],
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
      // Never ship source maps in production — they would hand the original,
      // un-obfuscated TypeScript back to anyone opening devtools, defeating the
      // obfuscation above.
      sourcemap: false,
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
