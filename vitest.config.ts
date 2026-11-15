import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000, fileParallelism: false } });
