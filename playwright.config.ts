import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 1,
  use: {
    baseURL: 'http://localhost:8300',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --port 8300 --strictPort',
    url: 'http://localhost:8300',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'quarter-screen', use: { ...devices['Desktop Chrome'], viewport: { width: 480, height: 270 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
