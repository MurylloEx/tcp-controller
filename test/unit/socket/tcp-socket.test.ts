import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FramingError } from '@/framing/framing-error';
import { createLengthPrefixCodec } from '@/framing/length-prefix-codec';
import { createRawCodec } from '@/framing/raw-codec';
import { createTcpSocket } from '@/socket/tcp-socket';
import type { ConnectionInfo } from '@/transport/connection';

const harness = (): {
  readonly info: ConnectionInfo;
  readonly written: Uint8Array[];
  readonly state: { ended: boolean };
} => {
  const written: Uint8Array[] = [];
  const state = { ended: false };
  const duplex = {
    write: (payload: Uint8Array): boolean => {
      written.push(payload);
      return true;
    },
    end: (): void => {
      state.ended = true;
    },
  } as ConnectionInfo['duplex'];
  const info: ConnectionInfo = {
    duplex,
    remoteAddress: '10.1.1.2',
    remotePort: 44000,
    localAddress: '10.1.1.1',
    localPort: 44001,
    encrypted: true,
    authorized: false,
  };
  return { info, written, state };
};

test('createTcpSocket copia os campos e gera ids distintos', () => {
  const { info } = harness();
  const socket = createTcpSocket(info, createRawCodec());
  const other = createTcpSocket(info, createRawCodec());
  assert.equal(socket.remoteAddress, '10.1.1.2');
  assert.equal(socket.remotePort, 44000);
  assert.equal(socket.localAddress, '10.1.1.1');
  assert.equal(socket.localPort, 44001);
  assert.equal(socket.encrypted, true);
  assert.equal(socket.authorized, false);
  assert.match(socket.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.notEqual(socket.id, other.id);

  const blank = createTcpSocket(
    {
      ...info,
      remoteAddress: undefined,
      remotePort: undefined,
      localAddress: undefined,
      localPort: undefined,
      encrypted: false,
      authorized: false,
    },
    createRawCodec(),
  );
  assert.equal(blank.remoteAddress, undefined);
  assert.equal(blank.remotePort, undefined);
  assert.equal(blank.localAddress, undefined);
  assert.equal(blank.localPort, undefined);
});

test('send escreve o frame codificado e end encerra o duplex', () => {
  const { info, written, state } = harness();
  const socket = createTcpSocket(info, createRawCodec());
  const payload = Uint8Array.from([1, 2, 3]);
  socket.send(payload);
  payload[0] = 9;
  assert.equal(written[0]?.[0], 1);
  assert.equal(Buffer.from(written[0] ?? new Uint8Array()).byteLength, 3);
  assert.equal(state.ended, false);
  socket.end();
  assert.equal(state.ended, true);
  assert.equal(written.length, 1);
});

test('send com length-prefix recusa payload acima do limite', () => {
  const { info, written } = harness();
  const socket = createTcpSocket(info, createLengthPrefixCodec(4));
  socket.send(Buffer.from('abcd'));
  assert.equal(written[0]?.byteLength, 8);
  assert.equal(written[0]?.[3], 4);
  assert.throws(() => socket.send(Buffer.from('abcde')), FramingError);
  assert.equal(written.length, 1);
});
