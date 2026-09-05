import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.EVAL_BASE_URL ?? "http://localhost:3004";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  testMatch: "eval-surfaces.spec.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
