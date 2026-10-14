import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callMessages, type Invocation } from '@/dispatch/invoke';
import { minLength, uint8At } from '@/dispatch/specifications';
import { TcpController, TcpCriteria, TcpMessage, TcpWhen } from '@/metadata/decorators';
import { readController } from '@/metadata/registry';
import type { ControllerDefinition, HandlerDefinition } from '@/metadata/types';
import type { TcpContext } from '@/types';

const blankContext = (): TcpContext => ({
  socket: undefined,
  host: undefined,
  port: undefined,
  hadError: undefined,
  error: undefined,
  source: undefined,
  method: undefined,
});

const invocation = (): Invocation => ({
  frame: undefined,
  view: undefined,
  socket: undefined,
  context: blankContext(),
  error: undefined,
  hadError: undefined,
});

const messagesOf = (definition: ControllerDefinition): readonly HandlerDefinition[] =>
  definition.handlers.filter((handler) => handler.kind === 'message');

const deliver = async (
  instance: object,
  definition: ControllerDefinition,
  frame: Uint8Array,
): Promise<void> => {
  await callMessages(instance, messagesOf(definition), frame, invocation(), () => {
    throw new Error('nao devia');
  });
};

test('um campo escolhe o handler', async () => {
  const order: string[] = [];

  @TcpController('127.0.0.1', 1)
  class Server {
    @TcpWhen({ offset: 0, width: 1, value: 0x01 })
    @TcpMessage()
    public onPing(): void {
      order.push('ping');
    }

    @TcpMessage()
    public onOther(): void {
      order.push('other');
    }
  }

  const definition = readController(Server);
  const ping = definition.handlers.find((handler) => handler.method === 'onPing');
  assert.deepEqual(ping?.when, [{ offset: 0, width: 1, value: 0x01 }]);
  const instance = new Server();
  await deliver(instance, definition, Uint8Array.from([0x01]));
  await deliver(instance, definition, Uint8Array.from([0x02]));
  assert.deepEqual(order, ['ping', 'other']);
});

test('dois campos no mesmo @TcpWhen escolhem o handler certo', async () => {
  const order: string[] = [];

  @TcpController('127.0.0.1', 1)
  class Server {
    @TcpWhen({ offset: 0, width: 1, value: 0x01 }, { offset: 2, width: 1, value: 0x10 })
    @TcpMessage()
    public onArm(): void {
      order.push('arm');
    }

    @TcpWhen({ offset: 0, width: 1, value: 0x01 }, { offset: 2, width: 1, value: 0x20 })
    @TcpMessage()
    public onDisarm(): void {
      order.push('disarm');
    }

    @TcpMessage()
    public onOther(): void {
      order.push('other');
    }
  }

  const definition = readController(Server);
  const arm = definition.handlers.find((handler) => handler.method === 'onArm');
  assert.deepEqual(arm?.when, [
    { offset: 0, width: 1, value: 0x01 },
    { offset: 2, width: 1, value: 0x10 },
  ]);
  const instance = new Server();
  await deliver(instance, definition, Uint8Array.from([0x01, 0x00, 0x10]));
  await deliver(instance, definition, Uint8Array.from([0x01, 0x00, 0x20]));
  await deliver(instance, definition, Uint8Array.from([0x01, 0x00, 0x30]));
  assert.deepEqual(order, ['arm', 'disarm', 'other']);
});

test('critério falso não consome e o próximo @TcpWhen casa', async () => {
  const order: string[] = [];

  @TcpController('127.0.0.1', 1)
  class Server {
    @TcpWhen({ offset: 0, width: 1, value: 0x01 }, uint8At(4, 0xff), minLength(8))
    @TcpCriteria(uint8At(1, 0x00))
    @TcpMessage()
    public onArm(): void {
      order.push('arm');
    }

    @TcpWhen({ offset: 0, width: 1, value: 0x01 })
    @TcpMessage()
    public onPing(): void {
      order.push('ping');
    }

    @TcpMessage()
    public onOther(): void {
      order.push('other');
    }
  }

  const definition = readController(Server);
  const arm = definition.handlers.find((handler) => handler.method === 'onArm');
  assert.equal(arm?.criteria.length, 3);
  const instance = new Server();
  await deliver(instance, definition, Uint8Array.from([0x01]));
  await deliver(
    instance,
    definition,
    Uint8Array.from([0x01, 0x01, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00]),
  );
  await deliver(
    instance,
    definition,
    Uint8Array.from([0x01, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00]),
  );
  await deliver(instance, definition, Uint8Array.from([0x02]));
  assert.deepEqual(order, ['ping', 'ping', 'arm', 'other']);
});

test('critério falso sem outro @TcpWhen cai no fallback', async () => {
  const order: string[] = [];

  @TcpController('127.0.0.1', 1)
  class Server {
    @TcpWhen({ offset: 0, width: 1, value: 0x01 }, minLength(8))
    @TcpMessage()
    public onArm(): void {
      order.push('arm');
    }

    @TcpMessage()
    public onOther(): void {
      order.push('other');
    }
  }

  const definition = readController(Server);
  const instance = new Server();
  await deliver(instance, definition, Uint8Array.from([0x01]));
  await deliver(
    instance,
    definition,
    Uint8Array.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  );
  assert.deepEqual(order, ['other', 'arm']);
});

test('frame curto não casa aquele @TcpWhen', async () => {
  const order: string[] = [];

  @TcpController('127.0.0.1', 1)
  class Server {
    @TcpWhen({ offset: 0, width: 1, value: 0x01 }, { offset: 2, width: 1, value: 0x10 })
    @TcpMessage()
    public onArm(): void {
      order.push('arm');
    }

    @TcpWhen({ offset: 0, width: 1, value: 0x01 })
    @TcpMessage()
    public onPing(): void {
      order.push('ping');
    }

    @TcpMessage()
    public onOther(): void {
      order.push('other');
    }
  }

  const definition = readController(Server);
  const instance = new Server();
  await deliver(instance, definition, Uint8Array.from([0x01, 0x10]));
  await deliver(instance, definition, Uint8Array.from([0x01, 0x00, 0x10]));
  await deliver(instance, definition, Uint8Array.from([]));
  assert.deepEqual(order, ['ping', 'arm', 'other']);
});

test('largura, offset, valor ou @TcpWhen() vazio falham na leitura', () => {
  @TcpController('127.0.0.1', 1)
  class Wide {
    @TcpWhen({ offset: 0, width: 3 as 1, value: 1 })
    @TcpMessage()
    public onWide(): void {}
  }

  @TcpController('127.0.0.1', 1)
  class Negative {
    @TcpWhen({ offset: -1, width: 1, value: 0 })
    @TcpMessage()
    public onNegative(): void {}
  }

  @TcpController('127.0.0.1', 1)
  class Fraction {
    @TcpWhen({ offset: 1.5, width: 1, value: 0 })
    @TcpMessage()
    public onFraction(): void {}
  }

  @TcpController('127.0.0.1', 1)
  class Overflow {
    @TcpWhen({ offset: 0, width: 1, value: 256 })
    @TcpMessage()
    public onBig(): void {}
  }

  @TcpController('127.0.0.1', 1)
  class Empty {
    @TcpWhen()
    @TcpMessage()
    public onEmpty(): void {}
  }

  assert.throws(() => readController(Wide), /Invalid @TcpWhen width on onWide: 3\./);
  assert.throws(() => readController(Negative), /Invalid @TcpWhen offset on onNegative: -1\./);
  assert.throws(() => readController(Fraction), /Invalid @TcpWhen offset on onFraction: 1\.5\./);
  assert.throws(() => readController(Overflow), /@TcpWhen value does not fit width 1: onBig=256\./);
  assert.throws(
    () => readController(Empty),
    /@TcpWhen\(\) on onEmpty requires a field or a criterion\./,
  );
});

test('@TcpWhen só com critérios é exclusivo e critério falso não consome', async () => {
  const order: string[] = [];

  @TcpController('127.0.0.1', 1)
  class Server {
    @TcpWhen(minLength(2), uint8At(0, 0x01))
    @TcpMessage()
    public onWide(): void {
      order.push('wide');
    }

    @TcpWhen(uint8At(0, 0x01))
    @TcpMessage()
    public onByte(): void {
      order.push('byte');
    }

    @TcpMessage()
    public onOther(): void {
      order.push('other');
    }

    @TcpMessage()
    public onRest(): void {
      order.push('rest');
    }
  }

  const definition = readController(Server);
  const wide = definition.handlers.find((handler) => handler.method === 'onWide');
  assert.deepEqual(wide?.when, []);
  const instance = new Server();
  await deliver(instance, definition, Uint8Array.from([0x01, 0x00]));
  await deliver(instance, definition, Uint8Array.from([0x01]));
  await deliver(instance, definition, Uint8Array.from([0x02, 0x00]));
  assert.deepEqual(order, ['wide', 'byte', 'other', 'rest']);
});

test('dois @TcpWhen iguais coexistem e o primeiro completo ganha', async () => {
  const order: string[] = [];

  @TcpController('127.0.0.1', 1)
  class Server {
    @TcpWhen({ offset: 0, width: 1, value: 0x01 })
    @TcpMessage()
    public onA(): void {
      order.push('a');
    }

    @TcpWhen({ offset: 0, width: 1, value: 0x01 })
    @TcpMessage()
    public onB(): void {
      order.push('b');
    }

    @TcpMessage()
    public onOther(): void {
      order.push('other');
    }
  }

  const definition = readController(Server);
  assert.deepEqual(
    definition.handlers.map((handler) => handler.method),
    ['onA', 'onB', 'onOther'],
  );
  const instance = new Server();
  await deliver(instance, definition, Uint8Array.from([0x01]));
  await deliver(instance, definition, Uint8Array.from([0x02]));
  assert.deepEqual(order, ['a', 'other']);
});
