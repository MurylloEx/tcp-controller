import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as codecModule from '@/framing/codec';
import type { DecodeResult, FrameCodec } from '@/framing/codec';
import { createRawCodec } from '@/framing/raw-codec';

test('codec.ts não tem valor de runtime e o codec cru cumpre FrameCodec', () => {
  const keys = Object.keys(codecModule).filter((key) => key !== '__esModule');
  assert.deepEqual(keys, []);
  const codec: FrameCodec = createRawCodec();
  const decoded: DecodeResult = codec.decode(new Uint8Array(), Buffer.from('tipo'));
  const frame = decoded.frames[0];
  assert.ok(frame);
  assert.equal(Buffer.from(frame).toString('utf8'), 'tipo');
  assert.equal(decoded.pending.byteLength, 0);
  assert.equal(codec.mode, 'raw');
});
