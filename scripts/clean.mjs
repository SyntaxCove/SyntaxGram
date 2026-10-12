// Tiny cross-platform cleaner used by build scripts.
import fs from 'node:fs';
import path from 'node:path';

for (const dir of process.argv.slice(2)) {
  fs.rmSync(path.resolve(process.cwd(), dir), { recursive: true, force: true });
}
