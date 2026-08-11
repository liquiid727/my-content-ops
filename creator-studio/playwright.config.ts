import { defineConfig } from '@playwright/test'

const foundationPort = 4311
const canvasPort = 4312

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  projects: [
    {
      name: 'foundation',
      testMatch: /project-lifecycle\.spec\.ts/,
      use: { baseURL: `http://127.0.0.1:${foundationPort}` },
    },
    {
      // Canvas 全链路 e2e 会真实创建 Run/Task，独立 server + 独立数据目录，
      // 避免污染 foundation 的「任务列表为空」等对状态敏感的用例。
      name: 'canvas',
      testMatch: /canvas-chain\.spec\.ts/,
      use: { baseURL: `http://127.0.0.1:${canvasPort}` },
    },
  ],
  webServer: [
    {
      command: `CREATOR_STUDIO_PORT=${foundationPort} CREATOR_STUDIO_DATA_DIR="$(mktemp -d)" pnpm run start`,
      url: `http://127.0.0.1:${foundationPort}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `CREATOR_STUDIO_PORT=${canvasPort} CREATOR_STUDIO_DATA_DIR="$(mktemp -d)" pnpm run start`,
      url: `http://127.0.0.1:${canvasPort}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
