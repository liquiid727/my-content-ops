import { defineConfig } from '@playwright/test'

const port = 4311

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `CREATOR_STUDIO_PORT=${port} CREATOR_STUDIO_DATA_DIR="$(mktemp -d)" npm run start`,
    url: `http://127.0.0.1:${port}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

