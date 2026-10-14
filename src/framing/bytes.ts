export const concatBytes = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  const merged = new Uint8Array(left.byteLength + right.byteLength);
  merged.set(left, 0);
  merged.set(right, left.byteLength);
  return merged;
};

export const copyBytes = (payload: Uint8Array): Uint8Array => {
  const copy = new Uint8Array(payload.byteLength);
  copy.set(payload, 0);
  return copy;
};
