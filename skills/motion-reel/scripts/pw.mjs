// Playwright lives in the project that holds the films (npm i -D playwright), not in the skill,
// so resolve it from the working directory first, then from next to the skill.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function loadChromium() {
  for (const base of [process.cwd(), path.resolve(HERE, '..')]) {
    try {
      const req = createRequire(path.join(base, 'noop.js'));
      const m = await import(pathToFileURL(req.resolve('playwright')).href);
      return m.chromium || m.default.chromium;
    } catch { /* try the next base */ }
  }
  console.error('playwright not found. In the project folder run:\n  npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
