import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { FrameCodec } from '@/framing/codec';
import { createLengthPrefixCodec } from '@/framing/length-prefix-codec';
import { createRawCodec } from '@/framing/raw-codec';
import type { ControllerDefinition, HandlerDefinition } from '@/metadata/types';
import { attach, createReporter, type Failure } from '@/runtime/connection';
import { SessionTable } from '@/runtime/sessions';
import type { ConnectionInfo } from '@/transport/connection';
import type { ControllerScope, TcpContext } from '@/types';
import { withTimeout } from '@/testing/await';
import { deferred } from '@/testing/deferred';

const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const definitionFor = (
  ctor: new () => object,
  handlers: readonly HandlerDefinition[],
  scope: ControllerScope = 'singleton',
): ControllerDefinition => ({
  ctor,
  endpoint: { host: '127.0.0.1', port: 0 },
  tls: undefined,
  stream: undefined,
  scope,
  handlers,
});

const openFake = (): {
  readonly emitter: EventEmitter;
  readonly info: ConnectionInfo;
  readonly destroyed: { value: boolean };
} => {
  const destroyed = { value: false };
  const emitter = new EventEmitter();
  Object.assign(emitter, {
    destroy: (): void => {
      destroyed.value = true;
    },
    write: (): boolean => true,
    end: (): void => undefined,
  });
  return {
    emitter,
    destroyed,
    info: {
      duplex: emitter as unknown as ConnectionInfo['duplex'],
      remoteAddress: '127.0.0.1',
      remotePort: 40_000,
      localAddress: '127.0.0.1',
      localPort: 50_000,
      encrypted: false,
      authorized: false,
    },
  };
};

test('attach junta pedaços de um frame length-prefix', async () => {
  const received = deferred<string>();
  class Echo {
    public onMessage(frame: Uint8Array): void {
      received.resolve(Buffer.from(frame).toString('utf8'));
    }
  }
  const codec = createLengthPrefixCodec(32);
  const encoded = codec.encode(Buffer.from('partes'));
  const table = new SessionTable();
  const { emitter, info } = openFake();
  const socket = attach({
    info,
    definition: definitionFor(Echo, [
      {
        method: 'onMessage',
        kind: 'message',
        parameters: [{ index: 0, kind: 'buffer' }],
        criteria: [],
      },
    ]),
    codec,
    singleton: new Echo(),
    table,
    report: () => undefined,
  });
  assert.equal(socket.remoteAddress, '127.0.0.1');
  assert.equal(table.read(socket.id)?.socket, socket);
  emitter.emit('data', encoded.subarray(0, 3));
  assert.equal(table.read(socket.id)?.pending.byteLength, 3);
  emitter.emit('data', encoded.subarray(3));
  assert.equal(table.read(socket.id)?.pending.byteLength, 0);
  assert.equal(await withTimeout(received.promise), 'partes');
});

test('frame acima do limite marca framing, destrói o duplex e ignora o resto', async () => {
  const messages: string[] = [];
  const failures: Failure[] = [];
  class Echo {
    public onMessage(frame: Uint8Array): void {
      messages.push(Buffer.from(frame).toString('utf8'));
    }
  }
  const { emitter, info, destroyed } = openFake();
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, 50, false);
  attach({
    info,
    definition: definitionFor(Echo, [
      {
        method: 'onMessage',
        kind: 'message',
        parameters: [{ index: 0, kind: 'buffer' }],
        criteria: [],
      },
    ]),
    codec: createLengthPrefixCodec(8),
    singleton: new Echo(),
    table: new SessionTable(),
    report: (failure) => {
      failures.push(failure);
    },
  });
  emitter.emit('data', header);
  emitter.emit('data', Buffer.from('depois'));
  await tick();
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.source, 'framing');
  assert.match(failures[0]?.error.message ?? '', /exceeds the limit/);
  assert.equal(destroyed.value, true);
  assert.deepEqual(messages, []);
});

test('decode que lança valor cru vira erro de framing', async () => {
  const failures: Failure[] = [];
  const codec: FrameCodec = {
    mode: 'raw',
    encode: (payload) => payload,
    decode: () => {
      throw 'quebra-framing';
    },
  };
  const { emitter, info } = openFake();
  attach({
    info,
    definition: definitionFor(class {}, []),
    codec,
    singleton: {},
    table: new SessionTable(),
    report: (failure) => {
      failures.push(failure);
    },
  });
  emitter.emit('data', Buffer.from('x'));
  assert.equal(failures[0]?.source, 'framing');
  assert.equal(failures[0]?.error.message, 'quebra-framing');
});

test('erro de transporte não destrói de novo e a segunda falha é ignorada', () => {
  const failures: Failure[] = [];
  const { emitter, info, destroyed } = openFake();
  attach({
    info,
    definition: definitionFor(class {}, []),
    codec: createRawCodec(),
    singleton: {},
    table: new SessionTable(),
    report: (failure) => {
      failures.push(failure);
    },
  });
  emitter.emit('error', new Error('queda-de-rede'));
  emitter.emit('error', new Error('outra'));
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.source, 'transport');
  assert.equal(failures[0]?.error.message, 'queda-de-rede');
  assert.equal(destroyed.value, false);
});

test('close notifica hadError uma vez e descarta dados seguintes', async () => {
  const calls: boolean[] = [];
  const messages: string[] = [];
  class Peer {
    public onDisconnect(hadError: boolean): void {
      calls.push(hadError);
    }

    public onMessage(frame: Uint8Array): void {
      messages.push(Buffer.from(frame).toString('utf8'));
    }
  }
  const { emitter, info } = openFake();
  attach({
    info,
    definition: definitionFor(Peer, [
      {
        method: 'onDisconnect',
        kind: 'disconnected',
        parameters: [{ index: 0, kind: 'hadError' }],
        criteria: [],
      },
      {
        method: 'onMessage',
        kind: 'message',
        parameters: [{ index: 0, kind: 'buffer' }],
        criteria: [],
      },
    ]),
    codec: createRawCodec(),
    singleton: new Peer(),
    table: new SessionTable(),
    report: () => undefined,
  });
  emitter.emit('close', false);
  emitter.emit('close', true);
  emitter.emit('data', Buffer.from('tarde'));
  await tick();
  assert.deepEqual(calls, [false]);
  assert.deepEqual(messages, []);
});

test('escopo singleton reutiliza a instância e connection cria outra', async () => {
  const sharedSeen = deferred<readonly object[]>();
  const sharedFound: object[] = [];
  class Shared {
    public onConnect(): void {
      sharedFound.push(this);
      if (sharedFound.length === 2) {
        sharedSeen.resolve(sharedFound);
      }
    }
  }
  const singleton = new Shared();
  const sharedDefinition = definitionFor(Shared, [
    { method: 'onConnect', kind: 'connected', parameters: [], criteria: [] },
  ]);
  const sharedTable = new SessionTable();
  const first = openFake();
  const second = openFake();
  attach({
    info: first.info,
    definition: sharedDefinition,
    codec: createRawCodec(),
    singleton,
    table: sharedTable,
    report: () => undefined,
  });
  attach({
    info: second.info,
    definition: sharedDefinition,
    codec: createRawCodec(),
    singleton,
    table: sharedTable,
    report: () => undefined,
  });
  const sharedBoth = await withTimeout(sharedSeen.promise);
  assert.equal(sharedBoth[0], singleton);
  assert.equal(sharedBoth[1], singleton);

  const freshSeen = deferred<readonly object[]>();
  const freshFound: object[] = [];
  class PerConnection {
    public onConnect(): void {
      freshFound.push(this);
      if (freshFound.length === 2) {
        freshSeen.resolve(freshFound);
      }
    }
  }
  const freshSingleton = new PerConnection();
  const freshDefinition = definitionFor(
    PerConnection,
    [{ method: 'onConnect', kind: 'connected', parameters: [], criteria: [] }],
    'connection',
  );
  const freshTable = new SessionTable();
  attach({
    info: openFake().info,
    definition: freshDefinition,
    codec: createRawCodec(),
    singleton: freshSingleton,
    table: freshTable,
    report: () => undefined,
  });
  attach({
    info: openFake().info,
    definition: freshDefinition,
    codec: createRawCodec(),
    singleton: freshSingleton,
    table: freshTable,
    report: () => undefined,
  });
  const freshBoth = await withTimeout(freshSeen.promise);
  assert.notEqual(freshBoth[0], freshBoth[1]);
  assert.notEqual(freshBoth[0], freshSingleton);
  assert.notEqual(freshBoth[1], freshSingleton);
  assert.equal(freshBoth[0] instanceof PerConnection, true);
});

test('exceção de mensagem chega ao reporter como erro de handler', async () => {
  const failed = deferred<TcpContext>();
  class Sample {
    public onMessage(): void {
      throw new Error('boom-handler');
    }

    public onError(context: TcpContext): void {
      if (context.source === 'handler') {
        failed.resolve(context);
      }
    }
  }
  const definition = definitionFor(Sample, [
    { method: 'onMessage', kind: 'message', parameters: [], criteria: [] },
    {
      method: 'onError',
      kind: 'error',
      parameters: [{ index: 0, kind: 'context' }],
      criteria: [],
    },
  ]);
  const { emitter, info } = openFake();
  attach({
    info,
    definition,
    codec: createRawCodec(),
    singleton: new Sample(),
    table: new SessionTable(),
    report: createReporter(definition),
  });
  emitter.emit('data', Buffer.from('x'));
  const context = await withTimeout(failed.promise);
  assert.equal(context.source, 'handler');
  assert.equal(context.method, 'onMessage');
  assert.equal(context.error?.message, 'boom-handler');
});

test('createReporter avisa reentrância e falha dentro de @TcpError', async () => {
  const chunks: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return original(chunk);
  }) as typeof process.stderr.write;

  try {
    const report = createReporter(
      definitionFor(class {}, [{ method: 'onError', kind: 'error', parameters: [], criteria: [] }]),
    );
    const instance = {
      onError(): void {
        report(
          {
            source: 'handler',
            error: new Error('segunda'),
            socket: undefined,
            method: 'reentrada',
          },
          instance,
        );
      },
    };
    report(
      {
        source: 'handler',
        error: new Error('primeira'),
        socket: undefined,
        method: 'reentrada',
      },
      instance,
    );
    await tick();
    assert.equal(
      chunks.some((line) => line.includes('reentrant error') && line.includes('segunda')),
      true,
    );

    chunks.length = 0;
    createReporter(
      definitionFor(class {}, [{ method: 'onError', kind: 'error', parameters: [], criteria: [] }]),
    )(
      {
        source: 'handler',
        error: new Error('origem'),
        socket: undefined,
        method: 'estoura',
      },
      {
        onError(): void {
          throw new Error('falha-no-tcp-error');
        },
      },
    );
    await tick();
    assert.equal(
      chunks.some((line) => line.includes('@TcpError onError failed: falha-no-tcp-error')),
      true,
    );
  } finally {
    process.stderr.write = original as typeof process.stderr.write;
  }
});
