import { defineConfig } from "vite";

// Build for the apex DASHBOARD Worker (src/dashboard/). Emitted into
// ./public-dashboard/dashboard/assets so the dashboard Worker's assets binding
// (directory ./public-dashboard) serves them at /dashboard/assets/* — the only
// path prefix this Worker owns on the apex (route troop10rwc.org/dashboard*).
//
//   - base = /dashboard/assets/  → the SSR shell + CSS url() fonts resolve to
//     /dashboard/assets/<file>, which routes back to this Worker's assets.
//   - dashboard.js / dashboard.css kept stable (the SSR shell links them);
//     fonts/chunks are content-hashed.
export default defineConfig({
  base: "/dashboard/assets/",
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "public-dashboard/dashboard/assets",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: { dashboard: "src/dashboard/client.tsx" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: (info) =>
          info.name?.endsWith(".css") ? "[name][extname]" : "[name]-[hash][extname]",
      },
    },
  },
});
