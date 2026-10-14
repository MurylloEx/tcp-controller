import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TLSSocket } from 'node:tls';
import { listenTls, openTls } from '@/transport/tls-transport';
import { listenTcp } from '@/transport/tcp-transport';
import { closeServer, withTimeout } from '@/testing/await';
import { hasOpenSsl, material } from '@/testing/cert';
import { deferred } from '@/testing/deferred';

test('listenTls exige cert e key', () => {
  const endpoint = { host: '127.0.0.1', port: 0 };
  assert.throws(() => listenTls(endpoint, {}, () => undefined), /cert and key/);
  assert.throws(() => listenTls(endpoint, { cert: 'x' }, () => undefined), /cert and key/);
  assert.throws(() => listenTls(endpoint, { key: 'x' }, () => undefined), /cert and key/);
});

test('openTls falha ao falar com um servidor TCP simples', { timeout: 5_000 }, async () => {
  const server = await listenTcp({ host: '127.0.0.1', port: 0 }, (info) => {
    info.duplex.destroy();
  });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Listening address unavailable.');
    }
    await assert.rejects(
      withTimeout(
        openTls(
          { host: '127.0.0.1', port: address.port },
          { rejectUnauthorized: false, servername: 'localhost' },
        ),
        1_000,
      ),
    );
  } finally {
    await closeServer(server);
  }
});

test(
  'listenTls e openTls completam o handshake com ALPN e CA em lista',
  { timeout: 20_000, skip: !hasOpenSsl() && 'openssl missing' },
  async () => {
    const files = material();
    const inbound = deferred<boolean>();
    const server = await listenTls(
      { host: '127.0.0.1', port: 0 },
      {
        cert: files.cert.toString('utf8'),
        key: files.key,
        alpnProtocols: ['h2', 'http/1.1'],
      },
      (info) => {
        inbound.resolve(info.encrypted);
      },
    );
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Listening address unavailable.');
      }
      const info = await withTimeout(
        openTls(
          { host: '127.0.0.1', port: address.port },
          {
            ca: [files.cert],
            servername: 'localhost',
            rejectUnauthorized: true,
            alpnProtocols: ['h2', 'http/1.1'],
          },
        ),
        10_000,
      );
      try {
        assert.equal(info.encrypted, true);
        assert.equal(info.authorized, true);
        assert.equal(info.duplex instanceof TLSSocket, true);
        if (info.duplex instanceof TLSSocket) {
          assert.equal(info.duplex.alpnProtocol, 'h2');
        }
        assert.equal(await withTimeout(inbound.promise), true);
      } finally {
        info.duplex.destroy();
      }
    } finally {
      await closeServer(server);
    }
  },
);
