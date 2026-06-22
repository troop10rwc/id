import { defineConfig } from "vitest/config";

// Worker logic is tested in Node 22 against the source. WebCrypto, fetch, btoa,
// and TextEncoder are globals in Node 22 (same as workerd), so no shim is needed.
export default defineConfig({
  test: {
    include: ["src/worker/**/*.test.ts"],
    testTimeout: 5000,
  },
});
