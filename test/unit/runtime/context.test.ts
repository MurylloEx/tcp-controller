import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  connectionInvocation,
  createContext,
  failureInvocation,
  listeningInvocation,
} from '@/runtime/context';
import type { TcpContext, TcpSocket } from '@/types';

const socket: TcpSocket = {
  id: 's1',
  remoteAddress: '127.0.0.1',
  remotePort: 1,
  localAddress: '127.0.0.1',
  localPort: 2,
  encrypted: false,
  authorized: false,
  send: () => undefined,
  end: () => undefined,
};

test('createContext congela uma cópia', () => {
  const original: TcpContext = {
    socket,
    host: 'h',
    port: 1,
    hadError: true,
    error: undefined,
    source: 'transport',
    method: 'm',
  };
  const frozen = createContext(original);
  assert.notEqual(frozen, original);
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(frozen.socket, socket);
  (original as { host: string }).host = 'outro';
  assert.equal(frozen.host, 'h');
  assert.throws(() => {
    (frozen as { host: string }).host = 'novo';
  });
});

test('connectionInvocation usa o endereço local do socket', () => {
  const frame = Uint8Array.from([1, 2]);
  const invocation = connectionInvocation(socket, {
    frame,
    error: undefined,
    hadError: false,
    source: undefined,
    method: undefined,
  });
  assert.equal(invocation.frame, frame);
  assert.equal(invocation.socket, socket);
  assert.equal(invocation.hadError, false);
  assert.equal(invocation.context.host, '127.0.0.1');
  assert.equal(invocation.context.port, 2);
  assert.equal(invocation.context.hadError, false);
  assert.equal(Object.isFrozen(invocation.context), true);
});

test('listeningInvocation e failureInvocation montam o contexto do evento', () => {
  const listening = listeningInvocation('0.0.0.0', 1337);
  assert.equal(listening.socket, undefined);
  assert.equal(listening.frame, undefined);
  assert.equal(listening.context.host, '0.0.0.0');
  assert.equal(listening.context.port, 1337);
  assert.equal(Object.isFrozen(listening.context), true);

  const error = new Error('falha');
  const failure = failureInvocation('handler', error, socket, 'onMessage');
  assert.equal(failure.error, error);
  assert.equal(failure.socket, socket);
  assert.equal(failure.context.source, 'handler');
  assert.equal(failure.context.method, 'onMessage');
  assert.equal(failure.context.error, error);
  assert.equal(failure.context.host, socket.localAddress);
  assert.equal(failure.context.port, socket.localPort);

  const bare = failureInvocation('transport', error, undefined, undefined);
  assert.equal(bare.socket, undefined);
  assert.equal(bare.context.socket, undefined);
  assert.equal(bare.context.host, undefined);
  assert.equal(bare.context.port, undefined);
  assert.equal(bare.context.source, 'transport');
  assert.equal(bare.context.method, undefined);
});
