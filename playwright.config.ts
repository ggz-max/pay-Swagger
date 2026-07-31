import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    { command: "pnpm dev:api", url: "http://127.0.0.1:3000/api/v1/health", reuseExistingServer: true },
    { command: "pnpm dev:customer", url: "http://127.0.0.1:5175", reuseExistingServer: true },
    { command: "pnpm dev:admin", url: "http://127.0.0.1:5174", reuseExistingServer: true },
  ],
});
