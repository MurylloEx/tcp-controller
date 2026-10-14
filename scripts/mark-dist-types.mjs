#!/usr/bin/env node
/**
 * Writes the `type` marker in each output directory so Node and TypeScript
 * interpret the emitted files:
 *
 * - dist/cjs stays CommonJS even if the root package.json gains `"type": "module"`.
 * - dist/esm is ESM, so the `import` condition resolves real modules.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const markers = [
  ['dist/cjs', 'commonjs'],
  ['dist/esm', 'module'],
];

await Promise.all(
  markers.map(async ([dir, type]) => {
    const target = path.join(root, dir);
    await mkdir(target, { recursive: true });
    await writeFile(
      path.join(target, 'package.json'),
      `${JSON.stringify({ type }, null, 2)}\n`,
      'utf8',
    );
  }),
);
