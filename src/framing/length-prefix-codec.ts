import { concatBytes, copyBytes } from '@/framing/bytes';
import type { DecodeResult, FrameCodec } from '@/framing/codec';
import { FramingError } from '@/framing/framing-error';

const encodeLengthPrefix = (payload: Uint8Array): Uint8Array => {
  if (payload.byteLength > 0xffff_ffff) {
    throw new FramingError('Payload exceeds uint32 size.');
  }
  const encoded = new Uint8Array(4 + payload.byteLength);
  new DataView(encoded.buffer).setUint32(0, payload.byteLength, false);
  encoded.set(payload, 4);
  return encoded;
};

class FrameAccumulator {
  private buffer: Uint8Array;

  private readonly frames: Uint8Array[] = [];

  public constructor(
    buffer: Uint8Array,
    private readonly maxFrameBytes: number,
  ) {
    this.buffer = buffer;
  }

  public pull(): DecodeResult {
    this.drain();
    return {
      pending: this.buffer,
      frames: Object.freeze(this.frames.map((frame) => copyBytes(frame))),
    };
  }

  private drain(): void {
    while (this.takeOne()) {
      continue;
    }
  }

  private takeOne(): boolean {
    if (this.buffer.byteLength < 4) {
      return false;
    }
    const length = new DataView(
      this.buffer.buffer,
      this.buffer.byteOffset,
      this.buffer.byteLength,
    ).getUint32(0, false);
    if (length > this.maxFrameBytes) {
      throw new FramingError(
        `Frame of ${length} bytes exceeds the limit of ${this.maxFrameBytes}.`,
      );
    }
    if (this.buffer.byteLength < 4 + length) {
      return false;
    }
    this.frames.push(this.buffer.slice(4, 4 + length));
    this.buffer = this.buffer.slice(4 + length);
    return true;
  }
}

export const createLengthPrefixCodec = (maxFrameBytes: number): FrameCodec => ({
  mode: 'length-prefix',
  encode: (payload) => {
    if (payload.byteLength > maxFrameBytes) {
      throw new FramingError(
        `Payload of ${payload.byteLength} bytes exceeds the limit of ${maxFrameBytes}.`,
      );
    }
    return encodeLengthPrefix(payload);
  },
  decode: (pending, chunk) =>
    new FrameAccumulator(concatBytes(pending, chunk), maxFrameBytes).pull(),
});
