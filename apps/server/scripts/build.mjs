// Bundles the server (and the workspace packages it uses) into a single dist/main.js.
// Third-party dependencies are bundled too, so the runtime image needs no node_modules.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src/main.ts')],
  outfile: path.join(dist, 'main.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  minify: false,
  legalComments: 'none',
  // Some CommonJS dependencies call require() for node built-ins; provide it in ESM output.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  // pg optionally loads native bindings; we use the pure JS driver.
  external: ['pg-native', 'cpu-features', 'bufferutil', 'utf-8-validate'],
  logLevel: 'info',
});

// SQL migrations ship next to the bundle; main.ts resolves them via MIGRATIONS_DIR or ./drizzle.
cpSync(path.join(root, 'drizzle'), path.join(dist, 'drizzle'), { recursive: true });
console.log('server build complete: apps/server/dist/main.js');
