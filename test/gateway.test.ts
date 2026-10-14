import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect as connectNet } from 'node:net';
import { test } from 'node:test';
import {
  connect,
  createServer,
  bytesEqual,
  TcpBuffer,
  TcpClientConnected,
  TcpClientDisconnected,
  TcpContext,
  TcpController,
  TcpCriteria,
  TcpError,
  TcpHadError,
  TcpMessage,
  TcpMessageStream,
  TcpScope,
  TcpSocket,
} from '@/index';
import { text, withTimeout } from '@/testing/await';
import { deferred } from '@/testing/deferred';

test('eco com framing de tamanho', async () => {
  const received = deferred<string>();

  @TcpController('127.0.0.1', 0)
  @TcpMessageStream({ maxFrameBytes: 1024 })
  class EchoServer {
    @TcpMessage()
    onMessage(@TcpBuffer() frame: Uint8Array, @TcpSocket() socket: TcpSocket): void {
      socket.send(Buffer.from(`eco:${text(frame)}`));
    }
  }

  @TcpController('127.0.0.1', 1)
  @TcpMessageStream({ maxFrameBytes: 1024 })
  class EchoClient {
    @TcpClientConnected()
    onConnect(@TcpSocket() socket: TcpSocket): void {
      socket.send(Buffer.from('um'));
      socket.send(Buffer.from('dois'));
    }

    @TcpMessage()
    onMessage(@TcpBuffer() frame: Uint8Array): void {
      if (text(frame) === 'eco:dois') {
        received.resolve(text(frame));
      }
    }
  }

  const server = createServer(EchoServer);
  try {
    const address = await server.ready;
    const client = connect(EchoClient, { host: address.host, port: address.port });
    try {
      await client.ready;
      assert.equal(await withTimeout(received.promise), 'eco:dois');
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
  }
});

test('critério filtra o handler', async () => {
  const matched = deferred<string>();
  const rejected = deferred<string>();

  @TcpController('127.0.0.1', 0)
  @TcpMessageStream()
  class Router {
    @TcpCriteria(bytesEqual(Buffer.from('ping')))
    @TcpMessage()
    onPing(@TcpBuffer() frame: Uint8Array): void {
      matched.resolve(text(frame));
    }

    @TcpCriteria(bytesEqual(Buffer.from('pong')))
    @TcpMessage()
    onPong(@TcpBuffer() frame: Uint8Array): void {
      rejected.resolve(text(frame));
    }
  }

  @TcpController('127.0.0.1', 1)
  @TcpMessageStream()
  class Client {
    @TcpClientConnected()
    onConnect(@TcpSocket() socket: TcpSocket): void {
      socket.send(Buffer.from('ping'));
    }
  }

  const server = createServer(Router);
  try {
    const address = await server.ready;
    const client = connect(Client, { port: address.port });
    try {
      await client.ready;
      assert.equal(await withTimeout(matched.promise), 'ping');
      const quiet = await Promise.race([
        rejected.promise.then(() => 'chamou'),
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve('silencio');
          }, 120);
        }),
      ]);
      assert.equal(quiet, 'silencio');
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
  }
});

test('exceção de handler chega em @TcpError', async () => {
  const failed = deferred<TcpContext>();

  @TcpController('127.0.0.1', 0)
  @TcpMessageStream()
  class Server {
    @TcpMessage()
    onMessage(): void {
      throw new Error('boom');
    }

    @TcpError()
    onError(@TcpContext() context: TcpContext): void {
      if (context.source === 'handler') {
        failed.resolve(context);
      }
    }
  }

  @TcpController('127.0.0.1', 1)
  @TcpMessageStream()
  class Client {
    @TcpClientConnected()
    onConnect(@TcpSocket() socket: TcpSocket): void {
      socket.send(Buffer.from('x'));
    }
  }

  const server = createServer(Server);
  try {
    const address = await server.ready;
    const client = connect(Client, { port: address.port });
    try {
      await client.ready;
      const context = await withTimeout(failed.promise);
      assert.equal(context.source, 'handler');
      assert.equal(context.method, 'onMessage');
      assert.equal(context.error?.message, 'boom');
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
  }
});

test('frame acima do limite encerra a conexão', async () => {
  const failed = deferred<string>();

  @TcpController('127.0.0.1', 0)
  @TcpMessageStream({ maxFrameBytes: 16 })
  class Server {
    @TcpError()
    onError(@TcpContext() context: TcpContext): void {
      if (context.source === 'framing') {
        failed.resolve(context.error?.message ?? '');
      }
    }
  }

  const server = createServer(Server);
  try {
    const address = await server.ready;
    const raw = connectNet({ host: address.host, port: address.port });
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, 10_000_000, false);
    raw.write(bytes);
    assert.match(await withTimeout(failed.promise), /exceeds the limit/);
    raw.destroy();
  } finally {
    await server.close();
  }
});

test('desconexão limpa notifica hadError', async () => {
  const closed = deferred<boolean>();

  @TcpController('127.0.0.1', 0)
  class Server {
    @TcpClientDisconnected()
    onDisconnect(@TcpHadError() hadError: boolean): void {
      closed.resolve(hadError);
    }
  }

  @TcpController('127.0.0.1', 1)
  class Client {
    @TcpClientConnected()
    onConnect(@TcpSocket() socket: TcpSocket): void {
      socket.end();
    }
  }

  const server = createServer(Server);
  try {
    const address = await server.ready;
    const client = connect(Client, { port: address.port });
    try {
      await client.ready;
      assert.equal(typeof (await withTimeout(closed.promise)), 'boolean');
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
  }
});

test('escopo de conexão isola instâncias', async () => {
  const labels = deferred<readonly [string, string]>();
  const seen: string[] = [];

  @TcpController('127.0.0.1', 0)
  @TcpScope('connection')
  @TcpMessageStream()
  class Server {
    private readonly label = randomUUID();

    @TcpMessage()
    onMessage(@TcpSocket() socket: TcpSocket): void {
      socket.send(Buffer.from(this.label));
    }
  }

  @TcpController('127.0.0.1', 1)
  @TcpMessageStream()
  class Client {
    @TcpClientConnected()
    onConnect(@TcpSocket() socket: TcpSocket): void {
      socket.send(Buffer.from('oi'));
    }

    @TcpMessage()
    onMessage(@TcpBuffer() frame: Uint8Array): void {
      seen.push(text(frame));
      if (seen.length === 2) {
        const [first, second] = seen;
        if (first !== undefined && second !== undefined) {
          labels.resolve([first, second]);
        }
      }
    }
  }

  const server = createServer(Server);
  try {
    const address = await server.ready;
    const first = connect(Client, { port: address.port });
    const second = connect(Client, { port: address.port });
    try {
      await first.ready;
      await second.ready;
      const [left, right] = await withTimeout(labels.promise);
      assert.notEqual(left, right);
    } finally {
      await first.close();
      await second.close();
    }
  } finally {
    await server.close();
  }
});

test('classe sem @TcpController falha na hora', () => {
  class Bare {}
  assert.throws(() => createServer(Bare), /@TcpController/);
});

test('modo cru entrega o chunk', async () => {
  const received = deferred<string>();

  @TcpController('127.0.0.1', 0)
  class Server {
    @TcpMessage()
    onMessage(@TcpBuffer() frame: Uint8Array): void {
      received.resolve(text(frame));
    }
  }

  @TcpController('127.0.0.1', 1)
  class Client {
    @TcpClientConnected()
    onConnect(@TcpSocket() socket: TcpSocket): void {
      socket.send(Buffer.from('ola'));
    }
  }

  const server = createServer(Server);
  try {
    const address = await server.ready;
    const client = connect(Client, { port: address.port });
    try {
      await client.ready;
      assert.equal(await withTimeout(received.promise), 'ola');
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
  }
});
