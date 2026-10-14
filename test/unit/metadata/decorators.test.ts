import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameView } from '@/framing/frame-view';
import {
  TcpBuffer,
  TcpClientConnected,
  TcpClientDisconnected,
  TcpContext,
  TcpController,
  TcpCriteria,
  TcpError,
  TcpException,
  TcpFrame,
  TcpHadError,
  TcpListening,
  TcpMessage,
  TcpMessageStream,
  TcpScope,
  TcpSecure,
  TcpSocket,
  TcpWhen,
} from '@/metadata/decorators';
import { readController } from '@/metadata/registry';
import { DEFAULT_MAX_FRAME_BYTES, type FrameView } from '@/types';

const tlsMaterial = {
  cert: 'certificado',
  key: 'chave',
  alpnProtocols: ['http/1.1'],
};

@TcpController('127.0.0.1', 4050)
@TcpSecure(tlsMaterial)
@TcpMessageStream({ maxFrameBytes: 2048 })
@TcpScope('connection')
class Gateway {
  @TcpListening()
  public onListening(@TcpContext() context: TcpContext): void {
    void context;
  }

  @TcpClientConnected()
  public onConnect(@TcpSocket() socket: TcpSocket): void {
    void socket;
  }

  @TcpClientDisconnected()
  public onDisconnect(@TcpHadError() hadError: boolean): void {
    void hadError;
  }

  @TcpError()
  public onError(@TcpException() error: Error): void {
    void error;
  }

  @TcpCriteria((frame: FrameView) => frame.byteLength === 4)
  @TcpCriteria((frame: FrameView) => frame.uint8(0) === 1)
  @TcpMessage()
  public onMessage(@TcpBuffer() frame: Uint8Array): void {
    void frame;
  }
}

@TcpController('127.0.0.1', 0)
class Quiet {}

@TcpController('127.0.0.1', 11)
@TcpMessageStream()
class DefaultStream {}

@TcpController('localhost', 65_535)
class HighPort {}

test('decorators gravam endpoint, tls, stream, escopo e handlers', () => {
  const definition = readController(Gateway);
  assert.deepEqual(definition.endpoint, { host: '127.0.0.1', port: 4050 });
  assert.equal(definition.scope, 'connection');
  assert.equal(definition.stream?.maxFrameBytes, 2048);
  assert.equal(definition.tls?.cert, 'certificado');
  assert.equal(definition.tls?.key, 'chave');
  assert.deepEqual(definition.tls?.alpnProtocols, ['http/1.1']);
  assert.equal(Object.isFrozen(definition.endpoint), true);
  assert.equal(Object.isFrozen(definition.tls), true);
  assert.equal(Object.isFrozen(definition.stream), true);
  assert.deepEqual(
    definition.handlers.map((handler) => [handler.method, handler.kind]),
    [
      ['onListening', 'listening'],
      ['onConnect', 'connected'],
      ['onDisconnect', 'disconnected'],
      ['onError', 'error'],
      ['onMessage', 'message'],
    ],
  );

  const parametersOf = (method: string): readonly (readonly [number, string])[] => {
    const handler = definition.handlers.find((item) => item.method === method);
    assert.ok(handler);
    return handler.parameters.map((item) => [item.index, item.kind]);
  };
  assert.deepEqual(parametersOf('onListening'), [[0, 'context']]);
  assert.deepEqual(parametersOf('onConnect'), [[0, 'socket']]);
  assert.deepEqual(parametersOf('onDisconnect'), [[0, 'hadError']]);
  assert.deepEqual(parametersOf('onError'), [[0, 'error']]);
  assert.deepEqual(parametersOf('onMessage'), [[0, 'buffer']]);

  const message = definition.handlers.find((handler) => handler.method === 'onMessage');
  assert.equal(message?.criteria.length, 2);
  const view = createFrameView(Uint8Array.from([0, 0, 0, 0]));
  const votes = message?.criteria.map((predicate) => predicate(view)).sort();
  assert.deepEqual(votes, [false, true]);
});

test('omissão de escopo e stream usa singleton e o limite padrão', () => {
  assert.equal(readController(Quiet).scope, 'singleton');
  assert.equal(readController(Quiet).stream, undefined);
  assert.equal(readController(Quiet).tls, undefined);
  assert.deepEqual(readController(Quiet).handlers, []);
  assert.equal(readController(DefaultStream).stream?.maxFrameBytes, DEFAULT_MAX_FRAME_BYTES);
  assert.equal(readController(HighPort).endpoint.port, 65_535);
  assert.equal(readController(HighPort).endpoint.host, 'localhost');
});

test('TcpSecure copia o material antes de o objeto original mudar', () => {
  const tls = { cert: 'certificado', key: 'chave' };
  @TcpController('127.0.0.1', 1)
  @TcpSecure(tls)
  class Secured {}
  tls.cert = 'mudou';
  assert.equal(readController(Secured).tls?.cert, 'certificado');
});

test('host vazio, porta inválida e limite inválido são recusados', () => {
  assert.throws(() => {
    @TcpController('   ', 1)
    class BlankHost {}
    return BlankHost;
  }, /Empty TCP host/);

  for (const port of [-1, 65_536, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => {
        @TcpController('127.0.0.1', port)
        class BadPort {}
        return BadPort;
      },
      (error: unknown) => {
        assert.equal(error instanceof Error && error.message, `Invalid TCP port: ${port}.`);
        return true;
      },
    );
  }

  for (const maxFrameBytes of [0, -5, 2.5, Number.NaN]) {
    assert.throws(
      () => {
        @TcpMessageStream({ maxFrameBytes })
        class BadFrame {}
        return BadFrame;
      },
      (error: unknown) => {
        assert.equal(
          error instanceof Error && error.message,
          `Invalid frame limit: ${maxFrameBytes}.`,
        );
        return true;
      },
    );
  }
});

test('decorator fora de método de instância não grava handler', () => {
  @TcpController('127.0.0.1', 80)
  class Mixed {
    @TcpMessage()
    public static ignored(@TcpBuffer() frame: Uint8Array): void {
      void frame;
    }

    @TcpListening()
    public onListening(): void {}
  }

  class SymbolHost {}
  TcpController('127.0.0.1', 0)(SymbolHost);
  TcpMessage()(SymbolHost.prototype, Symbol('oculto'), {});
  TcpBuffer()(SymbolHost, 'estatico', 0);

  assert.deepEqual(
    readController(Mixed).handlers.map((handler) => handler.method),
    ['onListening'],
  );
  assert.equal(readController(SymbolHost).handlers.length, 0);
});

test('critério ou parâmetro sem ciclo de vida falha na leitura', () => {
  @TcpController('127.0.0.1', 4)
  class Orphan {
    @TcpCriteria(() => true)
    public onMessage(@TcpBuffer() frame: Uint8Array): void {
      void frame;
    }
  }

  assert.throws(() => readController(Orphan), /Methods missing a lifecycle decorator: onMessage/);
});

test('TcpWhen e TcpFrame gravam o campo e o parâmetro', () => {
  @TcpController('127.0.0.1', 9)
  class Routed {
    @TcpWhen({ offset: 1, width: 2, value: 0 })
    @TcpMessage()
    public onKnown(@TcpFrame() frame: FrameView, @TcpBuffer() raw: Uint8Array): void {
      void frame;
      void raw;
    }

    @TcpMessage()
    public onOther(): void {}
  }

  const definition = readController(Routed);
  const known = definition.handlers.find((handler) => handler.method === 'onKnown');
  assert.deepEqual(known?.when, [{ offset: 1, width: 2, value: 0 }]);
  assert.equal(Object.isFrozen(known?.when), true);
  assert.equal(Object.isFrozen(known?.when?.[0]), true);
  const pairs = [...(known?.parameters ?? [])].sort((left, right) => left.index - right.index);
  assert.deepEqual(
    pairs.map((item) => [item.index, item.kind]),
    [
      [0, 'frame'],
      [1, 'buffer'],
    ],
  );
});

test('@TcpWhen sem @TcpMessage falha na leitura', () => {
  @TcpController('127.0.0.1', 8)
  class Listening {
    @TcpWhen({ offset: 0, width: 1, value: 1 })
    @TcpListening()
    public onListening(): void {}
  }

  assert.throws(() => readController(Listening), /@TcpWhen requires @TcpMessage: onListening\./);

  @TcpController('127.0.0.1', 8)
  class OrphanWhen {
    @TcpWhen({ offset: 0, width: 1, value: 1 })
    public onMessage(): void {}
  }

  assert.throws(
    () => readController(OrphanWhen),
    /Methods missing a lifecycle decorator: onMessage/,
  );
});
