import assert from 'node:assert/strict';
import { createConnection, createServer, type Socket } from 'node:net';
import { test } from 'node:test';
import { connect as connectTls, createServer as createTlsServer, TLSSocket } from 'node:tls';
import { describe } from '@/transport/connection';
import { closeServer, withTimeout } from '@/testing/await';
import { hasOpenSsl, material } from '@/testing/cert';
import { deferred } from '@/testing/deferred';

test('describe marca socket TCP comum como não criptografado', { timeout: 5_000 }, async () => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Listening address unavailable.');
    }
    const connected = deferred<Socket>();
    server.once('connection', (socket) => {
      connected.resolve(socket);
    });
    const client = createConnection({ host: '127.0.0.1', port: address.port });
    try {
      await new Promise<void>((resolve, reject) => {
        client.once('connect', () => {
          resolve();
        });
        client.once('error', reject);
      });
      const inbound = await connected.promise;
      try {
        const incoming = describe(inbound);
        const outgoing = describe(client);
        assert.equal(incoming.duplex, inbound);
        assert.equal(outgoing.duplex, client);
        assert.equal(incoming.encrypted, false);
        assert.equal(incoming.authorized, false);
        assert.equal(outgoing.encrypted, false);
        assert.equal(outgoing.authorized, false);
        assert.equal(incoming.localPort, address.port);
        assert.equal(outgoing.remotePort, address.port);
        assert.equal(typeof incoming.remotePort, 'number');
      } finally {
        inbound.destroy();
      }
    } finally {
      client.destroy();
    }
  } finally {
    await closeServer(server);
  }
});

test('describe trata valor que não é TLSSocket como conexão simples', () => {
  const socket = {
    remoteAddress: undefined,
    remotePort: undefined,
    localAddress: '127.0.0.1',
    localPort: 7,
  } as Socket;
  const info = describe(socket);
  assert.equal(info.encrypted, false);
  assert.equal(info.authorized, false);
  assert.equal(info.localPort, 7);
  assert.equal(info.remoteAddress, undefined);
  assert.equal(info.duplex, socket);
});

test(
  'describe marca TLSSocket como criptografado e autorizado',
  { timeout: 20_000, skip: !hasOpenSsl() && 'openssl missing' },
  async () => {
    const files = material();
    const server = createTlsServer({ cert: files.cert, key: files.key });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Listening address unavailable.');
      }
      const inbound = deferred<TLSSocket>();
      server.once('secureConnection', (socket) => {
        inbound.resolve(socket);
      });
      const client = connectTls({
        host: '127.0.0.1',
        port: address.port,
        ca: files.cert,
        servername: 'localhost',
        rejectUnauthorized: true,
      });
      try {
        await new Promise<void>((resolve, reject) => {
          client.once('secureConnect', () => {
            resolve();
          });
          client.once('error', reject);
        });
        const serverSocket = await withTimeout(inbound.promise);
        try {
          const outgoing = describe(client);
          const incoming = describe(serverSocket);
          assert.equal(client instanceof TLSSocket, true);
          assert.equal(outgoing.encrypted, true);
          assert.equal(outgoing.authorized, true);
          assert.equal(incoming.encrypted, true);
          assert.equal(outgoing.duplex, client);
        } finally {
          serverSocket.destroy();
        }
      } finally {
        client.destroy();
      }
    } finally {
      await closeServer(server);
    }
  },
);
