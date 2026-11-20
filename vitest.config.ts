import { defineConfig } from 'vitest/config';
// Las amenazas aleatorias (maleantes, recompensas y ciberpsicópatas) se apagan en las pruebas salvo donde se prueban a propósito.
process.env.THREATS = '0';
export default defineConfig({ test: { include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts', 'client/test/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000, fileParallelism: false } });
