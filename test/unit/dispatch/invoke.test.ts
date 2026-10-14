import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameView } from '@/framing/frame-view';
import { callHandlers, callMessages, invoke, type Invocation } from '@/dispatch/invoke';
import type { HandlerDefinition } from '@/metadata/types';
import type { FrameView, TcpContext, TcpSocket, WhenField } from '@/types';
import { deferred } from '@/testing/deferred';

const blankContext = (): TcpContext => ({
  socket: undefined,
  host: undefined,
  port: undefined,
  hadError: undefined,
  error: undefined,
  source: undefined,
  method: undefined,
});

const invocation = (frame?: Uint8Array): Invocation => ({
  frame,
  view: undefined,
  socket: undefined,
  context: blankContext(),
  error: undefined,
  hadError: undefined,
});

const handler = (
  method: string,
  criteria: HandlerDefinition['criteria'] = [],
  when?: readonly WhenField[],
): HandlerDefinition => ({
  method,
  kind: 'message',
  parameters: [],
  criteria,
  ...(when === undefined ? {} : { when }),
});

test('invoke injeta os parâmetros e deixa buracos sem binding', async () => {
  const frame = Uint8Array.from([9]);
  const view = createFrameView(frame);
  const error = new Error('ctx');
  const socket: TcpSocket = {
    id: 'sock',
    remoteAddress: '127.0.0.1',
    remotePort: 10,
    localAddress: '127.0.0.1',
    localPort: 11,
    encrypted: false,
    authorized: true,
    send: () => undefined,
    end: () => undefined,
  };
  const context = blankContext();
  const seen: unknown[] = [];
  const instance = {
    onMessage(a: unknown, b: unknown, c: unknown, d: unknown, e: unknown, f: unknown): void {
      seen.push(a, b, c, d, e, f);
    },
    onGap(a: unknown, b: unknown, c: unknown): void {
      seen.push('gap', a, b, c);
    },
  };
  const full: Invocation = {
    frame,
    view,
    socket,
    context,
    error,
    hadError: false,
  };
  await invoke(
    instance,
    {
      method: 'onMessage',
      kind: 'message',
      parameters: [
        { index: 0, kind: 'buffer' },
        { index: 1, kind: 'socket' },
        { index: 2, kind: 'context' },
        { index: 3, kind: 'error' },
        { index: 4, kind: 'hadError' },
        { index: 5, kind: 'frame' },
      ],
      criteria: [],
    },
    full,
  );
  await invoke(
    instance,
    {
      method: 'onGap',
      kind: 'message',
      parameters: [
        { index: 0, kind: 'buffer' },
        { index: 2, kind: 'hadError' },
      ],
      criteria: [],
    },
    full,
  );
  assert.deepEqual(seen, [
    frame,
    socket,
    context,
    error,
    false,
    view,
    'gap',
    frame,
    undefined,
    false,
  ]);
});

test('invoke aplica o método na instância e espera a promise', async () => {
  const state = { ran: false, label: '' };
  const instance = {
    label: 'instancia',
    async onMessage(): Promise<void> {
      state.label = this.label;
      await Promise.resolve();
      state.ran = true;
    },
  };
  await invoke(instance, handler('onMessage'), invocation());
  assert.equal(state.ran, true);
  assert.equal(state.label, 'instancia');
});

test('membro ausente ou que não é função falha', async () => {
  const missing: HandlerDefinition = handler('onMessage');
  await assert.rejects(invoke({}, missing, invocation()), /Member onMessage is not a method/);

  const errors: string[] = [];
  await callHandlers({ onMessage: 'nao' }, [missing], invocation(), (error, method) => {
    errors.push(`${method}:${error.message}`);
  });
  assert.deepEqual(errors, ['onMessage:Member onMessage is not a method.']);
});

test('callHandlers espera cada método e segue depois de uma falha', async () => {
  const order: string[] = [];
  const gate = deferred<void>();
  const started = deferred<void>();
  const instance = {
    async first(): Promise<void> {
      order.push('first-start');
      started.resolve();
      await gate.promise;
      order.push('first-end');
    },
    second(): void {
      order.push('second');
      throw 'texto-cru';
    },
    third(): void {
      order.push('third');
      throw 7;
    },
    fourth(): void {
      order.push('fourth');
    },
  };
  const errors: string[] = [];
  const running = callHandlers(
    instance,
    [handler('first'), handler('second'), handler('third'), handler('fourth')],
    invocation(),
    (error, method) => {
      errors.push(`${method}:${error.message}`);
    },
  );
  await started.promise;
  assert.deepEqual(order, ['first-start']);
  gate.resolve();
  await running;
  assert.deepEqual(order, ['first-start', 'first-end', 'second', 'third', 'fourth']);
  assert.deepEqual(errors, ['second:texto-cru', 'third:Unknown failure.']);
});

test('callHandlers com lista vazia resolve', async () => {
  await callHandlers({}, [], invocation(), () => {
    throw new Error('nao devia');
  });
});

test('callMessages filtra critérios e continua depois de falha', async () => {
  const order: string[] = [];
  const errors: string[] = [];
  const instance = {
    skip(): void {
      order.push('skip');
    },
    boom(): void {
      order.push('boom');
    },
    open(): void {
      order.push('open');
    },
    fail(): void {
      order.push('fail');
      throw new Error('handler');
    },
    after(): void {
      order.push('after');
    },
  };
  await callMessages(
    instance,
    [
      handler('skip', [() => false]),
      handler('boom', [
        () => {
          throw 'predicado';
        },
      ]),
      handler('open'),
      handler('fail', [() => true]),
      handler('after', [(frame) => frame.ascii() === 'ok']),
    ],
    Buffer.from('ok'),
    invocation(Buffer.from('ok')),
    (error, method) => {
      errors.push(`${method}:${error.message}`);
    },
  );
  assert.deepEqual(order, ['open', 'fail', 'after']);
  assert.deepEqual(errors, ['boom:predicado', 'fail:handler']);
});

test('callMessages compartilha uma FrameView entre critérios e @TcpFrame', async () => {
  const seen: FrameView[] = [];
  const instance = {
    onMessage(frame: FrameView): void {
      seen.push(frame);
    },
  };
  await callMessages(
    instance,
    [
      {
        method: 'onMessage',
        kind: 'message',
        parameters: [{ index: 0, kind: 'frame' }],
        criteria: [
          (frame) => {
            seen.push(frame);
            return frame.ascii() === 'ok';
          },
        ],
      },
    ],
    Buffer.from('ok'),
    invocation(Buffer.from('ok')),
    () => {
      throw new Error('nao devia');
    },
  );
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1]);
  assert.equal(seen[0]?.ascii(), 'ok');
});

test('o primeiro @TcpWhen completo é exclusivo e critério falso não consome', async () => {
  const order: string[] = [];
  const errors: string[] = [];
  const opcode = handler('opcode', [], [{ offset: 0, width: 1, value: 0 }]);
  const denied = handler('denied', [() => false], [{ offset: 0, width: 1, value: 1 }]);
  const next = handler('next', [], [{ offset: 0, width: 1, value: 1 }]);
  const exploding = handler(
    'exploding',
    [
      () => {
        throw new Error('criterio');
      },
    ],
    [{ offset: 0, width: 1, value: 2 }],
  );
  const fallbackA = handler('fallbackA');
  const fallbackB = handler('fallbackB');
  const instance = {
    opcode(): void {
      order.push('opcode');
    },
    denied(): void {
      order.push('denied');
    },
    next(): void {
      order.push('next');
    },
    exploding(): void {
      order.push('exploding');
    },
    fallbackA(): void {
      order.push('fallbackA');
    },
    fallbackB(): void {
      order.push('fallbackB');
    },
  };
  const handlers = [fallbackA, opcode, denied, next, exploding, fallbackB];
  const report = (error: Error, method: string): void => {
    errors.push(`${method}:${error.message}`);
  };
  await callMessages(instance, handlers, Uint8Array.from([0]), invocation(), report);
  await callMessages(instance, handlers, Uint8Array.from([1]), invocation(), report);
  await callMessages(instance, handlers, Uint8Array.from([2]), invocation(), report);
  await callMessages(instance, handlers, Uint8Array.from([9]), invocation(), report);
  assert.deepEqual(order, ['opcode', 'next', 'fallbackA', 'fallbackB']);
  assert.deepEqual(errors, ['exploding:criterio']);
});

test('frame curto para o campo não casa aquele when', async () => {
  const order: string[] = [];
  const wide = handler(
    'wide',
    [],
    [
      { offset: 0, width: 1, value: 0x01 },
      { offset: 2, width: 1, value: 0x10 },
    ],
  );
  const narrow = handler('narrow', [], [{ offset: 0, width: 1, value: 0x01 }]);
  const fallback = handler('fallback');
  const instance = {
    wide(): void {
      order.push('wide');
    },
    narrow(): void {
      order.push('narrow');
    },
    fallback(): void {
      order.push('fallback');
    },
  };
  const quiet = (): void => {
    throw new Error('nao devia');
  };
  await callMessages(
    instance,
    [wide, narrow, fallback],
    Uint8Array.from([0x01, 0x10]),
    invocation(),
    quiet,
  );
  await callMessages(instance, [wide, narrow, fallback], Uint8Array.from([]), invocation(), quiet);
  assert.deepEqual(order, ['narrow', 'fallback']);
});

test('despacho lê uint16be e uint32be', async () => {
  const order: string[] = [];
  const wide = handler('wide', [], [{ offset: 1, width: 2, value: 0x0102 }]);
  const word = handler('word', [], [{ offset: 0, width: 4, value: 7 }]);
  const other = handler('other');
  const instance = {
    wide(): void {
      order.push('wide');
    },
    word(): void {
      order.push('word');
    },
    other(): void {
      order.push('other');
    },
  };
  const quiet = (): void => {
    throw new Error('nao devia');
  };
  await callMessages(
    instance,
    [wide, other],
    Uint8Array.from([0x00, 0x01, 0x02]),
    invocation(),
    quiet,
  );
  await callMessages(
    instance,
    [word, other],
    Uint8Array.from([0x00, 0x00, 0x00, 0x07]),
    invocation(),
    quiet,
  );
  await callMessages(instance, [other], Uint8Array.from([1]), invocation(), quiet);
  assert.deepEqual(order, ['wide', 'word', 'other']);
});
