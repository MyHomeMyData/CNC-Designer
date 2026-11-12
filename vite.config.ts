import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The app is served on port 8090 everywhere (dev, preview, Docker, service).
// Port 80 must never be used on the target hosts.
const PORT = 8090;

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from any base URL.
  base: './',
  server: { port: PORT, strictPort: true, host: 'localhost' },
  preview: { port: PORT, strictPort: true },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
