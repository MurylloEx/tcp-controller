import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FramingError } from '@/framing/framing-error';
import { createLengthPrefixCodec } from '@/framing/length-prefix-codec';

const text = (frame: Uint8Array): string => Buffer.from(frame).toString('utf8');

const header = (length: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, length, false);
  return bytes;
};

test('length-prefix grava uint32 big-endian e devolve o payload', () => {
  const codec = createLengthPrefixCodec(1024);
  const payload = Buffer.alloc(300, 7);
  const encoded = codec.encode(payload);
  assert.equal(codec.mode, 'length-prefix');
  assert.equal(encoded.byteLength, 304);
  assert.equal(encoded[0], 0);
  assert.equal(encoded[1], 0);
  assert.equal(encoded[2], 1);
  assert.equal(encoded[3], 44);
  const decoded = codec.decode(new Uint8Array(), encoded);
  const frame = decoded.frames[0];
  assert.ok(frame);
  assert.equal(frame.byteLength, 300);
  assert.equal(frame[0], 7);
  assert.equal(decoded.pending.byteLength, 0);
  assert.equal(Object.isFrozen(decoded.frames), true);
});

test('length-prefix espera cabeçalho e corpo em pedaços', () => {
  const codec = createLengthPrefixCodec(32);
  const encoded = codec.encode(Buffer.from('abcd'));
  const head = codec.decode(new Uint8Array(), encoded.subarray(0, 3));
  assert.equal(head.frames.length, 0);
  assert.equal(head.pending.byteLength, 3);
  const body = codec.decode(head.pending, encoded.subarray(3, 5));
  assert.equal(body.frames.length, 0);
  assert.equal(body.pending.byteLength, 5);
  const done = codec.decode(body.pending, encoded.subarray(5));
  const frame = done.frames[0];
  assert.ok(frame);
  assert.equal(text(frame), 'abcd');
  assert.equal(done.pending.byteLength, 0);
});

test('length-prefix separa frames e guarda o resto', () => {
  const codec = createLengthPrefixCodec(32);
  const first = codec.encode(Buffer.from('a'));
  const second = codec.encode(Buffer.from('b'));
  const merged = new Uint8Array(first.byteLength + second.byteLength + 1);
  merged.set(first, 0);
  merged.set(second, first.byteLength);
  merged[merged.byteLength - 1] = 9;
  const decoded = codec.decode(new Uint8Array(), merged);
  assert.deepEqual(
    decoded.frames.map((frame) => text(frame)),
    ['a', 'b'],
  );
  assert.deepEqual([...decoded.pending], [9]);
});

test('length-prefix recusa frame e payload acima do limite', () => {
  const codec = createLengthPrefixCodec(4);
  assert.throws(
    () => codec.encode(Buffer.from('abcde')),
    (error: unknown) => {
      assert.equal(error instanceof FramingError, true);
      if (error instanceof FramingError) {
        assert.equal(error.message, 'Payload of 5 bytes exceeds the limit of 4.');
      }
      return true;
    },
  );
  assert.throws(
    () => codec.decode(new Uint8Array(), header(5)),
    (error: unknown) => {
      assert.equal(error instanceof FramingError, true);
      if (error instanceof FramingError) {
        assert.equal(error.message, 'Frame of 5 bytes exceeds the limit of 4.');
      }
      return true;
    },
  );
});

test('length-prefix aceita vazio e o tamanho exato do limite', () => {
  const codec = createLengthPrefixCodec(4);
  const empty = codec.decode(new Uint8Array(), codec.encode(new Uint8Array()));
  assert.equal(empty.frames[0]?.byteLength, 0);
  assert.deepEqual([...codec.encode(new Uint8Array())], [0, 0, 0, 0]);
  const exact = codec.decode(new Uint8Array(), codec.encode(Buffer.from('abcd')));
  assert.equal(text(exact.frames[0] ?? new Uint8Array()), 'abcd');
});

test('length-prefix devolve cópia do frame', () => {
  const codec = createLengthPrefixCodec(8);
  const encoded = codec.encode(Buffer.from('ab'));
  const decoded = codec.decode(new Uint8Array(), encoded);
  const frame = decoded.frames[0];
  assert.ok(frame);
  assert.notEqual(frame.buffer, encoded.buffer);
  frame[0] = 0;
  const again = codec.decode(new Uint8Array(), encoded);
  assert.equal(again.frames[0]?.[0], 'a'.charCodeAt(0));
});
