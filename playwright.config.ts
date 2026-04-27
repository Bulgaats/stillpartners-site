import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] }
    }
  ],
  webServer: {
    command: "next dev -H 127.0.0.1 -p 3001",
    url: "http://localhost:3001",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
