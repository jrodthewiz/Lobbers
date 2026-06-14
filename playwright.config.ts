import { defineConfig } from "@playwright/test";

const serverPort = process.env.LOBBERS_TEST_SERVER_PORT ?? "2577";
const clientPort = process.env.LOBBERS_TEST_CLIENT_PORT ?? "5183";
const serverUrl = `http://localhost:${serverPort}`;
const clientUrl = `http://localhost:${clientPort}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: clientUrl,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run dev:server",
      url: `${serverUrl}/api/health`,
      env: {
        PORT: serverPort,
      },
      reuseExistingServer: true,
      timeout: 20_000,
    },
    {
      command: `npm run dev:client -- --port ${clientPort}`,
      url: clientUrl,
      env: {
        VITE_SERVER_URL: serverUrl,
      },
      reuseExistingServer: true,
      timeout: 20_000,
    },
  ],
});
