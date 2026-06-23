import { defineConfig } from "vite";

// Two browser bundles, both emitted into ./public/assets (served by the Worker
// at /assets):
//   - passkey.js  — the vanilla WebAuthn island used by the SSR auth pages.
//   - backoffice.js (+ backoffice.css) — the React back office built on
//     @troop10rwc/ui, mounted by the /manage SSR shell into <div id="root">.
// Entry/CSS filenames are kept stable so the SSR HTML can reference them;
// font/chunk assets are content-hashed. base=/assets/ so the CSS url() font
// references resolve to /assets/<font> where the assets actually live.
export default defineConfig({
  base: "/assets/",
  build: {
    outDir: "public/assets",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        passkey: "src/client/passkey.ts",
        backoffice: "src/client/backoffice.tsx",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        // Keep *.css stable (the SSR shell links /assets/backoffice.css); hash
        // everything else (fonts) to avoid same-basename collisions.
        assetFileNames: (info) =>
          info.name?.endsWith(".css") ? "[name][extname]" : "[name]-[hash][extname]",
      },
    },
  },
});
