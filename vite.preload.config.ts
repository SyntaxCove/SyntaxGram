import { defineConfig } from 'vite';

// Preloads MUST be single-file CJS bundles (sandboxed preloads can only
// require("electron")). Building both entries in one pass would create a
// shared chunk, so we build them one at a time via --mode index|instagram.
export default defineConfig(({ mode }) => {
  const entry = mode === 'instagram' ? 'instagram' : 'index';
  return {
    build: {
      outDir: 'dist/preload',
      emptyOutDir: false,
      minify: false,
      target: 'chrome130',
      lib: {
        entry: entry === 'index' ? 'src/preload/index.ts' : 'src/preload/instagram.ts',
        formats: ['cjs'],
        fileName: () => (entry === 'index' ? 'index.js' : 'instagram.js'),
      },
      rollupOptions: {
        external: (id: string) => id === 'electron',
      },
    },
  };
});
