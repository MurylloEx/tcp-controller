import type { Criterion, FrameView } from '@/types';

const copyNeedle = (expected: Uint8Array | readonly number[]): Uint8Array =>
  Uint8Array.from(expected);

const sameBytes = (frame: FrameView, needle: Uint8Array): boolean =>
  frame.byteLength === needle.byteLength &&
  needle.every((byte, index) => frame.bytes[index] === byte);

const fits = (frame: FrameView, offset: number, width: number): boolean =>
  Number.isInteger(offset) && offset >= 0 && offset + width <= frame.byteLength;

export const bytesEqual = (expected: Uint8Array | readonly number[]): Criterion => {
  const needle = copyNeedle(expected);
  return (frame) => sameBytes(frame, needle);
};

export const prefix = (expected: Uint8Array | readonly number[]): Criterion => {
  const needle = copyNeedle(expected);
  // An empty prefix would match every frame. It is a miss instead.
  return (frame) =>
    needle.byteLength > 0 &&
    needle.byteLength <= frame.byteLength &&
    needle.every((byte, index) => frame.bytes[index] === byte);
};

export const bytesIncludes = (expected: Uint8Array | readonly number[]): Criterion => {
  const needle = copyNeedle(expected);
  // An empty needle never matches. Buffer#indexOf would report a hit at 0.
  return (frame) => {
    if (needle.byteLength === 0 || needle.byteLength > frame.byteLength) {
      return false;
    }
    return (
      Buffer.from(frame.bytes.buffer, frame.bytes.byteOffset, frame.bytes.byteLength).indexOf(
        needle,
      ) !== -1
    );
  };
};

export const uint8At =
  (offset: number, value: number): Criterion =>
  (frame) =>
    fits(frame, offset, 1) && frame.uint8(offset) === value;

export const uint16beAt =
  (offset: number, value: number): Criterion =>
  (frame) =>
    fits(frame, offset, 2) && frame.uint16be(offset) === value;

export const uint32beAt =
  (offset: number, value: number): Criterion =>
  (frame) =>
    fits(frame, offset, 4) && frame.uint32be(offset) === value;

export const minLength =
  (length: number): Criterion =>
  (frame) =>
    frame.byteLength >= length;

export const allOf =
  (...criteria: readonly Criterion[]): Criterion =>
  (frame) =>
    criteria.every((criterion) => criterion(frame));

export const anyOf =
  (...criteria: readonly Criterion[]): Criterion =>
  (frame) =>
    criteria.some((criterion) => criterion(frame));

export const not =
  (criterion: Criterion): Criterion =>
  (frame) =>
    !criterion(frame);
