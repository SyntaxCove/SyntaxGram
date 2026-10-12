import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

const external = (id: string) => id === 'electron' || id.startsWith('node:') || builtinModules.includes(id);

export default defineConfig({
  build: {
    outDir: 'dist/main',
    emptyOutDir: true,
    minify: false,
    target: 'node24',
    lib: {
      entry: 'src/main/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: { external },
  },
});
