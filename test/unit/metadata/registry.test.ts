import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameView } from '@/framing/frame-view';
import {
  readClass,
  readController,
  replaceParameters,
  updateHandler,
  writeClass,
} from '@/metadata/registry';
import { EMPTY_CLASS, EMPTY_PROTOTYPE, type ParameterBinding } from '@/metadata/types';

const endpoint = { host: '127.0.0.1', port: 9 } as const;

test('readClass devolve EMPTY_CLASS até writeClass gravar o metadado', () => {
  class Fresh {}
  assert.equal(readClass(Fresh), EMPTY_CLASS);
  assert.throws(() => {
    (EMPTY_CLASS as { scope: string }).scope = 'connection';
  });
  assert.equal(EMPTY_CLASS.scope, 'singleton');

  const next = {
    endpoint,
    tls: undefined,
    stream: { maxFrameBytes: 10 },
    scope: 'connection' as const,
  };
  writeClass(Fresh, next);
  assert.equal(readClass(Fresh), next);
});

test('updateHandler não altera EMPTY_PROTOTYPE e substitui o mesmo método', () => {
  class Twice {}
  updateHandler(Twice.prototype, 'onMessage', (draft) => ({ ...draft, kind: 'message' }));
  assert.equal(EMPTY_PROTOTYPE.handlers.length, 0);
  updateHandler(Twice.prototype, 'onMessage', (draft) => ({
    ...draft,
    kind: 'error',
    parameters: [{ index: 0, kind: 'error' }],
  }));
  writeClass(Twice, {
    endpoint,
    tls: undefined,
    stream: undefined,
    scope: 'singleton',
  });
  const definition = readController(Twice);
  assert.equal(definition.handlers.length, 1);
  assert.equal(definition.handlers[0]?.kind, 'error');
  assert.equal(definition.handlers[0]?.parameters[0]?.kind, 'error');
  assert.equal(definition.ctor, Twice);
  assert.equal(Object.isFrozen(definition), true);
  assert.equal(Object.isFrozen(definition.handlers), true);
  const handler = definition.handlers[0];
  assert.ok(handler);
  assert.equal(Object.isFrozen(handler), true);
  assert.equal(Object.isFrozen(handler.parameters), true);
  assert.equal(Object.isFrozen(handler.criteria), true);
});

test('rascunho sem ciclo de vida é omitido', () => {
  class Ignored {}
  writeClass(Ignored, {
    endpoint,
    tls: undefined,
    stream: undefined,
    scope: 'singleton',
  });
  updateHandler(Ignored.prototype, 'noop', (draft) => draft);
  assert.equal(readController(Ignored).handlers.length, 0);
});

test('readController exige endpoint e recusa órfãos', () => {
  class Bare {}
  assert.throws(() => readController(Bare), /@TcpController\(host, port\)/);

  class Orphan {}
  writeClass(Orphan, {
    endpoint,
    tls: undefined,
    stream: undefined,
    scope: 'singleton',
  });
  updateHandler(Orphan.prototype, 'alpha', (draft) => ({
    ...draft,
    criteria: [() => true],
  }));
  updateHandler(Orphan.prototype, 'beta', (draft) => ({
    ...draft,
    parameters: [{ index: 0, kind: 'buffer' }],
  }));
  assert.throws(
    () => readController(Orphan),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      if (error instanceof Error) {
        assert.equal(error.message, 'Methods missing a lifecycle decorator: alpha, beta.');
      }
      return true;
    },
  );
});

test('handlers da subclasse substituem os do ancestral', () => {
  class Parent {}
  class Child extends Parent {}
  const tls = { cert: 'c', key: 'k' };
  writeClass(Child, {
    endpoint,
    tls,
    stream: { maxFrameBytes: 12 },
    scope: 'connection',
  });
  updateHandler(Parent.prototype, 'onListening', (draft) => ({ ...draft, kind: 'listening' }));
  updateHandler(Parent.prototype, 'onMessage', (draft) => ({
    ...draft,
    kind: 'message',
    criteria: [() => false],
  }));
  updateHandler(Child.prototype, 'onMessage', (draft) => ({
    ...draft,
    kind: 'message',
    criteria: [() => true],
  }));
  updateHandler(Child.prototype, 'onError', (draft) => ({ ...draft, kind: 'error' }));

  const definition = readController(Child);
  assert.deepEqual(
    definition.handlers.map((handler) => handler.method),
    ['onListening', 'onMessage', 'onError'],
  );
  const message = definition.handlers.find((handler) => handler.method === 'onMessage');
  assert.equal(message?.criteria[0]?.(createFrameView(new Uint8Array())), true);
  assert.equal(definition.tls, tls);
  assert.equal(definition.stream?.maxFrameBytes, 12);
  assert.equal(definition.scope, 'connection');
});

test('replaceParameters troca o índice e preserva o array original', () => {
  const original: readonly ParameterBinding[] = [
    { index: 0, kind: 'buffer' },
    { index: 1, kind: 'socket' },
  ];
  const replaced = replaceParameters(original, { index: 0, kind: 'context' });
  const appended = replaceParameters(original, { index: 2, kind: 'hadError' });
  assert.deepEqual(replaced, [
    { index: 1, kind: 'socket' },
    { index: 0, kind: 'context' },
  ]);
  assert.deepEqual(appended, [
    { index: 0, kind: 'buffer' },
    { index: 1, kind: 'socket' },
    { index: 2, kind: 'hadError' },
  ]);
  assert.equal(original[0]?.kind, 'buffer');
});

const metadata = {
  endpoint,
  tls: undefined,
  stream: undefined,
  scope: 'singleton' as const,
};

const whenOf = (value: number) => ({
  fields: [{ offset: 0, width: 1, value }],
  criteria: [],
});

test('métodos com o mesmo @TcpWhen coexistem e a subclasse substitui o ancestral', () => {
  class Parent {}
  class Child extends Parent {}
  writeClass(Child, metadata);
  updateHandler(Parent.prototype, 'onA', (draft) => ({
    ...draft,
    kind: 'message',
    when: whenOf(7),
  }));
  updateHandler(Child.prototype, 'onB', (draft) => ({
    ...draft,
    kind: 'message',
    when: whenOf(7),
  }));
  const both = readController(Child);
  assert.deepEqual(
    both.handlers.map((handler) => [handler.method, handler.when?.[0]?.value]),
    [
      ['onA', 7],
      ['onB', 7],
    ],
  );

  class ParentOnly {}
  class ChildOnly extends ParentOnly {}
  writeClass(ChildOnly, metadata);
  updateHandler(ParentOnly.prototype, 'onMessage', (draft) => ({
    ...draft,
    kind: 'message',
    when: whenOf(1),
  }));
  updateHandler(ChildOnly.prototype, 'onMessage', (draft) => ({
    ...draft,
    kind: 'message',
    when: whenOf(2),
  }));
  const definition = readController(ChildOnly);
  const message = definition.handlers.find((handler) => handler.method === 'onMessage');
  assert.deepEqual(message?.when, [{ offset: 0, width: 1, value: 2 }]);
  assert.equal(definition.handlers.filter((handler) => handler.method === 'onMessage').length, 1);
});

test('@TcpWhen fora de @TcpMessage falha na leitura', () => {
  class Listening {}
  writeClass(Listening, metadata);
  updateHandler(Listening.prototype, 'onListening', (draft) => ({
    ...draft,
    kind: 'listening',
    when: whenOf(1),
  }));
  assert.throws(() => readController(Listening), /@TcpWhen requires @TcpMessage: onListening\./);
});

test('valor de @TcpWhen maior que a largura falha na leitura', () => {
  class Wide {}
  writeClass(Wide, metadata);
  updateHandler(Wide.prototype, 'onBig', (draft) => ({
    ...draft,
    kind: 'message',
    when: whenOf(256),
  }));
  assert.throws(() => readController(Wide), /@TcpWhen value does not fit width 1: onBig=256\./);
});

test('@TcpWhen() vazio falha na leitura com o nome do método', () => {
  class Empty {}
  writeClass(Empty, metadata);
  updateHandler(Empty.prototype, 'onEmpty', (draft) => ({
    ...draft,
    kind: 'message',
    when: { fields: [], criteria: [] },
  }));
  assert.throws(
    () => readController(Empty),
    /@TcpWhen\(\) on onEmpty requires a field or a criterion\./,
  );
});
