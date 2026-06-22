import { defineConfig } from "vite";

// Builds the browser "island" that runs the WebAuthn ceremonies
// (@simplewebauthn/browser) into ./public/assets/passkey.js. The Worker
// serves that file as a static asset and the SSR pages reference it. No SPA —
// the auth pages are server-rendered; this is just the passkey glue.
export default defineConfig({
  build: {
    outDir: "public/assets",
    emptyOutDir: true,
    target: "es2022",
    lib: {
      entry: "src/client/passkey.ts",
      formats: ["es"],
      fileName: () => "passkey.js",
    },
  },
});
