import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cache: { value: { readonly cert: Buffer; readonly key: Buffer } | undefined } = {
  value: undefined,
};

export const hasOpenSsl = (): boolean => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

export const material = (): { readonly cert: Buffer; readonly key: Buffer } => {
  const existing = cache.value;
  if (existing !== undefined) {
    return existing;
  }
  const directory = mkdtempSync(join(tmpdir(), 'tcp-controller-'));
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-nodes',
      '-subj',
      '/CN=localhost',
    ],
    { stdio: 'ignore' },
  );
  const created = { cert: readFileSync(certPath), key: readFileSync(keyPath) };
  cache.value = created;
  return created;
};
