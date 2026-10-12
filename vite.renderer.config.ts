import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const projectRoot = process.cwd();

// Adds a strict CSP only for production builds (dev needs Vite/HMR inline scripts).
const cspPlugin = {
  name: 'igd-csp',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.cdninstagram.com https://*.fbcdn.net https://*.instagram.com",
      "media-src 'self' blob: https://*.cdninstagram.com https://*.fbcdn.net",
      "font-src 'self' data:",
      "connect-src 'self'",
    ].join('; ');
    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
  },
};

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), tailwindcss(), cspPlugin],
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [projectRoot] },
  },
  build: {
    outDir: path.resolve(projectRoot, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome130',
  },
});
