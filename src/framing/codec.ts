export type DecodeResult = {
  readonly pending: Uint8Array;
  readonly frames: readonly Uint8Array[];
};

export type FrameCodec = {
  readonly mode: 'raw' | 'length-prefix';
  encode(payload: Uint8Array): Uint8Array;
  decode(pending: Uint8Array, chunk: Uint8Array): DecodeResult;
};
