import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5183",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run dev:server",
      url: "http://localhost:2577/api/health",
      env: {
        PORT: "2577",
      },
      reuseExistingServer: true,
      timeout: 20_000,
    },
    {
      command: "npm run dev:client -- --port 5183",
      url: "http://localhost:5183",
      env: {
        VITE_SERVER_URL: "http://localhost:2577",
      },
      reuseExistingServer: true,
      timeout: 20_000,
    },
  ],
});
