import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    env: {
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:1704nahida@localhost:5432/university_schedule_test',
    },
    sequence: { concurrent: false },
    fileParallelism: false,
  },
});