import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    // Run all tests in a fixed, DST-observing zone so midnight/DST tests are deterministic.
    env: { TZ: 'America/New_York' },
  },
});
