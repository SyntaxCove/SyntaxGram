// Dev orchestrator: builds main/preload/injection in watch mode, starts the
// Vite dev server for the renderer, waits for the bundles and launches Electron.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const procs = [];
let shuttingDown = false;

const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(name, args, extraEnv = {}) {
  const p = spawn(npxBin, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `[${name}]`;
  const pipe = (stream, out) => {
    stream.on('data', (d) => {
      for (const line of d.toString().split('\n').filter(Boolean)) out.write(`${tag} ${line}\n`);
    });
  };
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => {
    if (!shuttingDown) console.log(`${tag} exited with code ${code}`);
  });
  procs.push(p);
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForFiles(files) {
  for (let i = 0; i < 240; i++) {
    if (files.every((f) => fs.existsSync(path.join(root, f)))) return;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for: ${files.join(', ')}`);
}

run('main', ['vite', 'build', '--config', 'vite.main.config.ts', '--watch']);
run('preload-index', ['vite', 'build', '--config', 'vite.preload.config.ts', '--watch', '--mode', 'index']);
run('preload-instagram', ['vite', 'build', '--config', 'vite.preload.config.ts', '--watch', '--mode', 'instagram']);
run('injection', ['vite', 'build', '--config', 'vite.injection.config.ts', '--watch']);
run('renderer', ['vite', '--config', 'vite.renderer.config.ts']);

try {
  await waitForFiles(['dist/main/index.js', 'dist/preload/index.js', 'dist/preload/instagram.js', 'dist/injection/instagram.js']);
} catch (e) {
  console.error('[dev]', e.message);
  shuttingDown = true;
  for (const p of procs) p.kill();
  process.exit(1);
}

console.log('[dev] bundles ready — launching Electron…');
run('electron', ['.', '--igd-dev'], {
  VITE_DEV_SERVER_URL: 'http://localhost:5173',
  NODE_ENV: 'development',
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[dev] shutting down…');
  for (const p of procs) {
    try {
      p.kill();
    } catch {
      /* already gone */
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);
