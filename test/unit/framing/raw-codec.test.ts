import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRawCodec } from '@/framing/raw-codec';

const text = (frame: Uint8Array): string => Buffer.from(frame).toString('utf8');

test('raw copia o payload e ignora o pending', () => {
  const codec = createRawCodec();
  const payload = Uint8Array.from([97, 98, 99]);
  const encoded = codec.encode(payload);
  assert.equal(codec.mode, 'raw');
  assert.notEqual(encoded, payload);
  encoded[0] = 0;
  assert.equal(payload[0], 97);

  const decoded = codec.decode(Buffer.from('antigo'), Buffer.from('novo'));
  const frame = decoded.frames[0];
  assert.ok(frame);
  assert.equal(text(frame), 'novo');
  assert.equal(decoded.pending.byteLength, 0);
  assert.equal(Object.isFrozen(decoded.frames), true);
});

test('raw entrega chunk vazio como um frame', () => {
  const decoded = createRawCodec().decode(new Uint8Array(), new Uint8Array());
  assert.equal(decoded.frames.length, 1);
  assert.equal(decoded.frames[0]?.byteLength, 0);
  assert.equal(decoded.pending.byteLength, 0);
});
