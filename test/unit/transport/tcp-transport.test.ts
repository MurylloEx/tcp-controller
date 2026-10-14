import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:net';
import { test } from 'node:test';
import { connectTcp, listen, listenTcp } from '@/transport/tcp-transport';
import { closeServer, withTimeout } from '@/testing/await';
import { deferred } from '@/testing/deferred';

const portOf = (server: Server): number => {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Listening address unavailable.');
  }
  return address.port;
};

test('listenTcp aceita conexão em 127.0.0.1 porta 0', { timeout: 5_000 }, async () => {
  const inbound = deferred<number>();
  const server = await listenTcp({ host: '127.0.0.1', port: 0 }, (info) => {
    inbound.resolve(info.localPort ?? -1);
  });
  try {
    const port = portOf(server);
    const outbound = await connectTcp({ host: '127.0.0.1', port });
    try {
      assert.equal(outbound.remotePort, port);
      assert.equal(outbound.encrypted, false);
      assert.equal(outbound.authorized, false);
      assert.equal(await withTimeout(inbound.promise), port);
    } finally {
      outbound.duplex.destroy();
    }
  } finally {
    await closeServer(server);
  }
});

test('listen rejeita porta ocupada', { timeout: 5_000 }, async () => {
  const held = createServer();
  await listen(held, { host: '127.0.0.1', port: 0 });
  try {
    const other = createServer();
    await assert.rejects(listen(other, { host: '127.0.0.1', port: portOf(held) }));
    other.close(() => undefined);
  } finally {
    await closeServer(held);
  }
});

test('listenTcp rejeita host inválido', { timeout: 5_000 }, async () => {
  await assert.rejects(
    withTimeout(
      listenTcp({ host: '256.256.256.256', port: 0 }, () => undefined),
      1_000,
    ),
  );
});

test('connectTcp rejeita porta fechada', { timeout: 5_000 }, async () => {
  await assert.rejects(withTimeout(connectTcp({ host: '127.0.0.1', port: 1 }), 1_000));
});
