import { defineConfig } from 'vite';

// The Instagram enhancement layer is compiled to a single IIFE bundle that the
// main process injects into the Instagram WebContentsView via executeJavaScript.
export default defineConfig({
  build: {
    outDir: 'dist/injection',
    emptyOutDir: true,
    minify: true,
    target: 'chrome130',
    lib: {
      entry: 'src/injection/index.ts',
      formats: ['iife'],
      name: 'IGDesktop',
      fileName: () => 'instagram.js',
    },
  },
});
