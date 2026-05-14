import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: [
      { find: "@pkg/shared/logging", replacement: path.resolve(__dirname, "packages/shared/src/logging.ts") },
      { find: "@pkg/db", replacement: path.resolve(__dirname, "packages/db/src/index.ts") },
      { find: "@pkg/scoring", replacement: path.resolve(__dirname, "packages/scoring/src/index.ts") },
      { find: "@pkg/shared", replacement: path.resolve(__dirname, "packages/shared/src/index.ts") },
      { find: "@pkg/vcpkg-parser", replacement: path.resolve(__dirname, "packages/vcpkg-parser/src/index.ts") },
    ],
  },
});
