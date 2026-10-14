import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TcpClientConnected,
  TcpContext,
  TcpController,
  TcpError,
  TcpException,
  TcpListening,
  TcpSecure,
  TcpSocket,
} from '@/metadata/decorators';
import { connect, createServer } from '@/runtime/bootstrap';
import { withTimeout } from '@/testing/await';
import { hasOpenSsl, material } from '@/testing/cert';
import { deferred } from '@/testing/deferred';

test(
  'createServer e connect respeitam o override e entregam o socket',
  { timeout: 5_000 },
  async () => {
    const heard = deferred<{
      readonly host: string | undefined;
      readonly port: number | undefined;
    }>();
    const opened = deferred<TcpSocket>();

    @TcpController('0.0.0.0', 9)
    class Server {
      @TcpListening()
      public onListening(@TcpContext() context: TcpContext): void {
        heard.resolve({ host: context.host, port: context.port });
      }
    }

    @TcpController('10.0.0.1', 9)
    class Client {
      @TcpClientConnected()
      public onConnect(@TcpSocket() socket: TcpSocket): void {
        opened.resolve(socket);
      }
    }

    const server = createServer(Server, { host: '127.0.0.1', port: 0 });
    try {
      const address = await withTimeout(server.ready);
      const heardAddress = await withTimeout(heard.promise);
      assert.equal(address.host, '127.0.0.1');
      assert.equal(address.port > 0, true);
      assert.equal(heardAddress.host, address.host);
      assert.equal(heardAddress.port, address.port);

      const client = connect(Client, { host: address.host, port: address.port });
      try {
        const socket = await withTimeout(client.ready);
        const connected = await withTimeout(opened.promise);
        assert.equal(connected.id, socket.id);
        assert.equal(socket.encrypted, false);
      } finally {
        await withTimeout(client.close());
      }
    } finally {
      await withTimeout(server.close());
    }
  },
);

test('falha em @TcpListening chega ao @TcpError', { timeout: 5_000 }, async () => {
  const failed = deferred<string>();

  @TcpController('127.0.0.1', 0)
  class Server {
    @TcpListening()
    public onListening(): void {
      throw new Error('na-escuta');
    }

    @TcpError()
    public onError(@TcpContext() context: TcpContext, @TcpException() error: Error): void {
      if (context.method === 'onListening') {
        failed.resolve(`${context.source}:${context.method}:${error.message}`);
      }
    }
  }

  const server = createServer(Server);
  try {
    const address = await withTimeout(server.ready);
    assert.equal(address.port > 0, true);
    assert.equal(await withTimeout(failed.promise), 'handler:onListening:na-escuta');
  } finally {
    await withTimeout(server.close());
  }
});

test(
  'createServer rejeita host de escuta inválido e o close resolve',
  { timeout: 5_000 },
  async () => {
    @TcpController('127.0.0.1', 0)
    class Server {}

    const server = createServer(Server, { host: '256.256.256.256' });
    try {
      await assert.rejects(withTimeout(server.ready, 1_000));
    } finally {
      await withTimeout(server.close());
    }
  },
);

test('createServer e connect exigem @TcpController', () => {
  class Bare {}
  assert.throws(() => createServer(Bare), /@TcpController/);
  assert.throws(() => connect(Bare), /@TcpController/);
});

test('createServer propaga falha do construtor', () => {
  @TcpController('127.0.0.1', 0)
  class Boom {
    public constructor() {
      throw new Error('ctor-falhou');
    }
  }
  assert.throws(() => createServer(Boom), /ctor-falhou/);
});

test('connect rejeita porta fechada e reporta erro de transporte', { timeout: 5_000 }, async () => {
  const failed = deferred<string>();

  @TcpController('127.0.0.1', 1)
  class Client {
    @TcpError()
    public onError(@TcpContext() context: TcpContext): void {
      if (context.source === 'transport' && context.socket === undefined) {
        failed.resolve(context.error?.message ?? '');
      }
    }
  }

  const client = connect(Client);
  try {
    const rejected = deferred<string>();
    await assert.rejects(withTimeout(client.ready, 1_000), (error: unknown) => {
      assert.equal(error instanceof Error, true);
      if (error instanceof Error) {
        rejected.resolve(error.message);
      }
      return true;
    });
    const reported = await withTimeout(failed.promise);
    assert.equal(reported, await rejected.promise);
    assert.equal(reported.length > 0, true);
  } finally {
    await withTimeout(client.close());
  }
});

test('close repetido devolve a mesma promise', { timeout: 5_000 }, async () => {
  @TcpController('127.0.0.1', 0)
  class Server {}

  const server = createServer(Server);
  const closing = server.close();
  const address = await withTimeout(server.ready);
  assert.equal(address.port > 0, true);
  assert.equal(server.close(), closing);
  await withTimeout(closing);
  await withTimeout(server.close());
});

test(
  'createServer e connect usam TLS quando a classe tem @TcpSecure',
  { timeout: 20_000, skip: !hasOpenSsl() && 'openssl missing' },
  async () => {
    const files = material();

    @TcpController('127.0.0.1', 0)
    @TcpSecure({ cert: files.cert, key: files.key })
    class Server {}

    @TcpController('127.0.0.1', 1)
    @TcpSecure({ ca: files.cert, servername: 'localhost', rejectUnauthorized: true })
    class Client {}

    const server = createServer(Server);
    try {
      const address = await withTimeout(server.ready, 10_000);
      const client = connect(Client, { port: address.port });
      try {
        const socket = await withTimeout(client.ready, 10_000);
        assert.equal(socket.encrypted, true);
        assert.equal(socket.authorized, true);
      } finally {
        await withTimeout(client.close());
      }
    } finally {
      await withTimeout(server.close());
    }
  },
);
