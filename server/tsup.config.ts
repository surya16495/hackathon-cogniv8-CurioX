import { defineConfig } from 'tsup';

// Bundles the server and the @lumora/shared workspace package into dist/
// so production runs plain JS with no TypeScript loader.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@lumora/shared'],
});
