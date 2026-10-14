import type { FrameView } from '@/types';

const readNumber = (
  byteLength: number,
  offset: number,
  width: 1 | 2 | 4,
  decode: () => number,
): number => {
  if (!Number.isInteger(offset) || offset < 0 || offset + width > byteLength) {
    throw new RangeError(`Offset ${offset} width ${width} is outside the frame.`);
  }
  return decode();
};

export const createFrameView = (bytes: Uint8Array): FrameView => {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cache: { value: string | undefined } = { value: undefined };
  return Object.freeze({
    bytes,
    byteLength: bytes.byteLength,
    uint8: (offset: number): number =>
      readNumber(bytes.byteLength, offset, 1, () => data.getUint8(offset)),
    uint16be: (offset: number): number =>
      readNumber(bytes.byteLength, offset, 2, () => data.getUint16(offset, false)),
    uint32be: (offset: number): number =>
      readNumber(bytes.byteLength, offset, 4, () => data.getUint32(offset, false)),
    ascii: (): string => {
      if (cache.value !== undefined) {
        return cache.value;
      }
      const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
      cache.value = text;
      return text;
    },
  });
};
