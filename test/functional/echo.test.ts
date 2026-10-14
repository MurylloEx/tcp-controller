import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  connect,
  createServer,
  TcpBuffer,
  TcpClientConnected,
  TcpController,
  TcpMessage,
  TcpMessageStream,
  TcpSocket,
} from '@/index';
import { text, withTimeout } from '@/testing/await';
import { deferred } from '@/testing/deferred';

const payload = 'mensagem-funcional';
const reply = `reply:${payload}`;

test(
  'cliente e servidor trocam uma mensagem e registram o tráfego',
  { timeout: 5_000 },
  async (t) => {
    const received = deferred<string>();
    const lines: string[] = [];
    const trace = (line: string): void => {
      lines.push(line);
      console.log(line);
      t.diagnostic(line);
    };

    @TcpController('127.0.0.1', 0)
    @TcpMessageStream()
    class EchoServer {
      @TcpMessage()
      public onMessage(@TcpBuffer() frame: Uint8Array, @TcpSocket() socket: TcpSocket): void {
        const body = text(frame);
        trace(`[server] received: ${body}`);
        const outgoing = `reply:${body}`;
        trace(`[server] sent: ${outgoing}`);
        socket.send(Buffer.from(outgoing));
      }
    }

    @TcpController('127.0.0.1', 1)
    @TcpMessageStream()
    class EchoClient {
      @TcpClientConnected()
      public onConnect(@TcpSocket() socket: TcpSocket): void {
        trace(`[client] sent: ${payload}`);
        socket.send(Buffer.from(payload));
      }

      @TcpMessage()
      public onMessage(@TcpBuffer() frame: Uint8Array): void {
        const body = text(frame);
        trace(`[client] received: ${body}`);
        received.resolve(body);
      }
    }

    const server = createServer(EchoServer);
    try {
      const address = await server.ready;
      const client = connect(EchoClient, { host: address.host, port: address.port });
      try {
        await client.ready;
        assert.equal(await withTimeout(received.promise), reply);
        assert.deepEqual(
          lines.filter((line) => line.startsWith('[client]')),
          [`[client] sent: ${payload}`, `[client] received: ${reply}`],
        );
        assert.deepEqual(
          lines.filter((line) => line.startsWith('[server]')),
          [`[server] received: ${payload}`, `[server] sent: ${reply}`],
        );
      } finally {
        await client.close();
      }
    } finally {
      await server.close();
    }
  },
);
