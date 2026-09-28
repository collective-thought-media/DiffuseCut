import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Tests must never open or create the real app data folder.
    env: {
      DIFFUSECUT_DATA_DIR: path.resolve(__dirname, ".vitest-data"),
      DIFFUSECUT_DB_PATH: path.resolve(__dirname, ".vitest-data", "diffusecut.db"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
