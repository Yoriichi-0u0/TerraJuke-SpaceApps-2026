import { defineConfig, devices } from '@playwright/test';

// BASE_URL=https://… runs the same suite against a deployed site (no local server).
const baseURL = process.env.BASE_URL ?? 'http://localhost:4317';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run preview', url: 'http://localhost:4317', reuseExistingServer: false },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } } },
    { name: 'webkit-iphone13', use: { ...devices['iPhone 13'] } },
  ],
});
