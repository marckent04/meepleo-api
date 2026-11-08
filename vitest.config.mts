import path from 'node:path'
import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

const src = path.resolve(import.meta.dirname, 'src')

export default defineConfig({
  // SWC emits the decorator metadata required by Nest injection.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  oxc: false,
  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        find: /^@database$/,
        replacement: `${src}/infrastructure/database/index.ts`,
      },
      { find: /^@\//, replacement: `${src}/` },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/infrastructure/database/generated/**', 'src/**/*.spec.ts'],
    },
  },
})
