import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLengthPrefixCodec } from '@/framing/length-prefix-codec';
import { createRawCodec } from '@/framing/raw-codec';
import { FramingError } from '@/framing/framing-error';

const text = (frame: Uint8Array): string => Buffer.from(frame).toString('utf8');

const header = (length: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, length, false);
  return bytes;
};

test('length-prefix junta frames e pedaços', () => {
  const codec = createLengthPrefixCodec(32);
  const encoded = codec.encode(Buffer.from('abc'));
  const partial = codec.decode(new Uint8Array(), encoded.subarray(0, 2));
  assert.equal(partial.frames.length, 0);
  const complete = codec.decode(partial.pending, encoded.subarray(2));
  assert.equal(text(complete.frames[0] ?? new Uint8Array()), 'abc');

  const pair = codec.decode(
    new Uint8Array(),
    Buffer.concat([codec.encode(Buffer.from('a')), codec.encode(Buffer.from('b'))]),
  );
  assert.deepEqual(pair.frames.map(text), ['a', 'b']);
  assert.equal(pair.pending.byteLength, 0);
});

test('length-prefix recusa frame acima do limite', () => {
  const codec = createLengthPrefixCodec(8);
  assert.throws(() => codec.decode(new Uint8Array(), header(9)), FramingError);
  assert.throws(() => codec.encode(Buffer.alloc(9)), FramingError);
});

test('raw entrega cada chunk como frame', () => {
  const codec = createRawCodec();
  const decoded = codec.decode(Buffer.from('antigo'), Buffer.from('novo'));
  assert.equal(text(decoded.frames[0] ?? new Uint8Array()), 'novo');
  assert.equal(decoded.pending.byteLength, 0);
});
