import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  connect,
  createServer,
  TcpBuffer,
  TcpClientConnected,
  TcpController,
  TcpMessage,
  TcpMessageStream,
  TcpSecure,
  TcpSocket,
} from '@/index';
import { text, withTimeout } from '@/testing/await';
import { deferred } from '@/testing/deferred';

const hasOpenSsl = (): boolean => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const material = (): { readonly cert: Buffer; readonly key: Buffer } => {
  const directory = mkdtempSync(join(tmpdir(), 'tcp-controller-'));
  const key = join(directory, 'key.pem');
  const cert = join(directory, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-nodes',
      '-subj',
      '/CN=localhost',
    ],
    { stdio: 'ignore' },
  );
  return { cert: readFileSync(cert), key: readFileSync(key) };
};

test('eco sobre TLS', { skip: hasOpenSsl() ? false : 'openssl missing' }, async () => {
  const files = material();
  const received = deferred<string>();

  @TcpController('127.0.0.1', 0)
  @TcpSecure({ cert: files.cert, key: files.key })
  @TcpMessageStream()
  class Server {
    @TcpMessage()
    onMessage(@TcpBuffer() frame: Uint8Array, @TcpSocket() socket: TcpSocket): void {
      assert.equal(socket.encrypted, true);
      socket.send(Buffer.from(`tls:${text(frame)}`));
    }
  }

  @TcpController('127.0.0.1', 1)
  @TcpSecure({ ca: files.cert, servername: 'localhost', rejectUnauthorized: true })
  @TcpMessageStream()
  class Client {
    @TcpClientConnected()
    onConnect(@TcpSocket() socket: TcpSocket): void {
      assert.equal(socket.encrypted, true);
      assert.equal(socket.authorized, true);
      socket.send(Buffer.from('segredo'));
    }

    @TcpMessage()
    onMessage(@TcpBuffer() frame: Uint8Array): void {
      received.resolve(text(frame));
    }
  }

  const server = createServer(Server);
  try {
    const address = await server.ready;
    const client = connect(Client, { port: address.port });
    try {
      const peer = await client.ready;
      assert.equal(peer.authorized, true);
      assert.equal(await withTimeout(received.promise), 'tls:segredo');
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
  }
});
