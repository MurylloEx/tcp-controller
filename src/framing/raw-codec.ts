import { copyBytes } from '@/framing/bytes';
import type { FrameCodec } from '@/framing/codec';

export const createRawCodec = (): FrameCodec => ({
  mode: 'raw',
  encode: (payload) => copyBytes(payload),
  decode: (_pending, chunk) => ({
    pending: new Uint8Array(0),
    frames: Object.freeze([copyBytes(chunk)]),
  }),
});
