import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.ts'],
    setupFiles: ['apps/web/src/test/setup.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
