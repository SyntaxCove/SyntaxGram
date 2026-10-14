// Patches electron-builder's NSIS target so Windows installers can be built
// on Linux WITHOUT Wine.
//
// Why: for the default NSIS template electron-builder builds a "phase 1"
// installer and then EXECUTES it once under Wine to extract the uninstaller
// stub (NsisTarget.computeScriptAndSignUninstaller). On macOS Catalina and
// newer that wine step is replaced by `UninstallerReader.exec`, a pure-JS
// PE parser that extracts the very same stub from the installer file —
// no process execution at all. That reader is fully platform-independent
// (fs + zlib only), so Linux can use it too; only the platform gate
// (`isMacOsCatalina()`) prevents it.
//
// What this script does (idempotent — safe to run before every build):
//   changes the condition from
//     if (isMacOsCatalina())  { UninstallerReader... } else { WineVm... }
//   to
//     if (process.platform !== "win32" || isMacOsCatalina()) { ... }
//
// Windows builds are untouched (the original wine/direct-exec path is kept
// there). The patch lives in node_modules and must be re-applied after a
// fresh `npm install`; the `dist` npm script runs it automatically.
//
// Usage: node scripts/patch-nsis-wine.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');

const ORIGINAL = 'if ((0, macosVersion_1.isMacOsCatalina)()) {';
const PATCHED = 'if (process.platform !== "win32" || (0, macosVersion_1.isMacOsCatalina)()) {';

let source;
try {
  source = fs.readFileSync(target, 'utf8');
} catch {
  console.log('[patch-nsis-wine] app-builder-lib not installed — skipping (run npm install first).');
  process.exit(0);
}

if (source.includes(PATCHED)) {
  console.log('[patch-nsis-wine] already applied.');
  process.exit(0);
}

if (!source.includes(ORIGINAL)) {
  console.warn('[patch-nsis-wine] pattern not found — app-builder-lib version changed, patch skipped.');
  process.exit(0);
}

fs.writeFileSync(target, source.replace(ORIGINAL, PATCHED));
console.log('[patch-nsis-wine] applied: Linux/macOS NSIS builds now extract the uninstaller without Wine.');
