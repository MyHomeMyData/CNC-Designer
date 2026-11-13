import { defineConfig, devices } from '@playwright/test';

// Browser tests run against a production build on their own port, so they
// do not collide with the development server or a running container (8090).
const PORT = 8191;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1400, height: 950 } },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 950 } },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
