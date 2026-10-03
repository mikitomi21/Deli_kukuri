import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  testMatch: ["call-integration.spec.ts", "session-recovery.spec.ts"],
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    locale: "pl-PL",
    trace: "retain-on-failure",
  },
})
