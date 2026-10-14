import assert from 'node:assert/strict';
import { test } from 'node:test';
import { concatBytes, copyBytes } from '@/framing/bytes';

test('concatBytes junta os dois lados sem alterar os originais', () => {
  const left = Uint8Array.from([1, 2]);
  const right = Uint8Array.from([3]);
  const merged = concatBytes(left, right);
  assert.deepEqual([...merged], [1, 2, 3]);
  left[0] = 9;
  right[0] = 8;
  assert.deepEqual([...merged], [1, 2, 3]);
  assert.deepEqual([...concatBytes(new Uint8Array(), right)], [8]);
  assert.deepEqual([...concatBytes(left, new Uint8Array())], [9, 2]);
});

test('copyBytes devolve uma cópia independente', () => {
  const payload = Uint8Array.from([4, 5]);
  const copy = copyBytes(payload);
  assert.notEqual(copy, payload);
  copy[0] = 1;
  assert.equal(payload[0], 4);
  assert.deepEqual([...copyBytes(new Uint8Array())], []);
});
