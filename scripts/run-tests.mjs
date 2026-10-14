import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Node 20 does not expand a glob passed to --test. Hand it the test files.
const walk = (directory) =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = walk('dist-test/test')
  .filter((path) => path.endsWith('.test.js'))
  .sort();

if (files.length === 0) {
  process.stderr.write('No test files found.\n');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
