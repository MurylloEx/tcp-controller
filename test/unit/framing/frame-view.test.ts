import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameView } from '@/framing/frame-view';

test('a vista aponta para os bytes e lê inteiros big-endian', () => {
  const backing = Uint8Array.from([0x09, 0x01, 0x02, 0x03, 0x04, 0xff]);
  const bytes = backing.subarray(1, 5);
  const view = createFrameView(bytes);
  assert.equal(view.bytes, bytes);
  assert.equal(view.byteLength, 4);
  assert.equal(view.uint8(0), 0x01);
  assert.equal(view.uint16be(0), 0x0102);
  assert.equal(view.uint16be(2), 0x0304);
  assert.equal(view.uint32be(0), 0x01020304);
  assert.equal(view.ascii(), Buffer.from([0x01, 0x02, 0x03, 0x04]).toString('latin1'));
});

test('leitura fora do frame lança RangeError', () => {
  const view = createFrameView(Uint8Array.from([0x0a, 0x0b]));
  for (const read of [
    () => view.uint8(2),
    () => view.uint8(-1),
    () => view.uint8(0.5),
    () => view.uint16be(1),
    () => view.uint32be(0),
    () => createFrameView(new Uint8Array()).uint8(0),
  ]) {
    assert.throws(read, (error: unknown) => {
      assert.equal(error instanceof RangeError, true);
      if (error instanceof RangeError) {
        assert.match(error.message, /outside the frame/);
      }
      return true;
    });
  }
});

test('ascii é preguiçoso e fica em cache naquela vista', () => {
  const bytes = Uint8Array.from([0x41, 0x42]);
  const view = createFrameView(bytes);
  bytes[1] = 0x43;
  const cached = view.ascii();
  assert.equal(cached, 'AC');
  bytes[1] = 0x44;
  assert.equal(view.uint8(1), 0x44);
  assert.equal(view.ascii(), 'AC');
  assert.equal(createFrameView(bytes).ascii(), 'AD');
  assert.equal(createFrameView(new Uint8Array()).ascii(), '');
});
