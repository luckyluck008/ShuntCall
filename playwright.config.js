import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: {
    timeout: 30000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
    headless: true,
  },
  webServer: [
    {
      command: 'npm run relay',
      port: 8768,
      timeout: 30000,
      reuseExistingServer: true,
    },
    {
      command: 'npx http-server . -p 8765',
      port: 8765,
      timeout: 30000,
      reuseExistingServer: true,
    }
  ],
});
