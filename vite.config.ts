import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 900 },
  test: { include: ["tests/**/*.test.ts"] },
});
