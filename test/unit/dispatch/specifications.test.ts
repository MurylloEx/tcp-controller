import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allOf,
  anyOf,
  bytesEqual,
  bytesIncludes,
  minLength,
  not,
  prefix,
  uint16beAt,
  uint32beAt,
  uint8At,
} from '@/dispatch/specifications';
import { createFrameView } from '@/framing/frame-view';

const viewOf = (bytes: readonly number[]): ReturnType<typeof createFrameView> =>
  createFrameView(Uint8Array.from(bytes));

test('igualdade, prefixo e inclusão comparam bytes e rejeitam agulha vazia', () => {
  const frame = viewOf([1, 2, 3]);
  const empty = createFrameView(new Uint8Array());
  assert.equal(bytesEqual([1, 2, 3])(frame), true);
  assert.equal(bytesEqual([1, 2])(frame), false);
  assert.equal(bytesEqual([1, 2, 3, 4])(frame), false);
  assert.equal(bytesEqual([])(empty), true);
  assert.equal(bytesEqual([])(frame), false);
  assert.equal(prefix([1, 2])(frame), true);
  assert.equal(prefix([1, 2, 3, 4])(frame), false);
  assert.equal(prefix([2])(frame), false);
  assert.equal(prefix([])(frame), false);
  assert.equal(prefix([])(empty), false);
  assert.equal(bytesIncludes([2, 3])(frame), true);
  assert.equal(bytesIncludes([3, 4])(frame), false);
  assert.equal(bytesIncludes([1, 2, 3, 4])(frame), false);
  assert.equal(bytesIncludes([])(frame), false);
  assert.equal(bytesIncludes([])(empty), false);

  const backing = Uint8Array.from([1, 2, 3, 4]);
  const slice = createFrameView(backing.subarray(1, 3));
  assert.equal(bytesIncludes([1, 2])(slice), false);
  assert.equal(bytesIncludes([2, 3])(slice), true);
  assert.equal(bytesIncludes([3, 4])(slice), false);
  assert.equal(prefix([2, 3])(slice), true);
  assert.equal(bytesEqual([2, 3])(slice), true);
});

test('a agulha é copiada na criação do critério', () => {
  const source = Uint8Array.from([1, 2]);
  const criterion = bytesEqual(source);
  source[0] = 9;
  assert.equal(criterion(viewOf([1, 2])), true);
  assert.equal(criterion(viewOf([9, 2])), false);
});

test('campos numéricos fora do frame não casam e não lançam', () => {
  const frame = viewOf([1, 2, 3]);
  assert.equal(uint8At(2, 3)(frame), true);
  assert.equal(uint8At(3, 0)(frame), false);
  assert.equal(uint8At(-1, 1)(frame), false);
  assert.equal(uint8At(0.5, 1)(frame), false);
  assert.equal(uint16beAt(1, 0x0203)(frame), true);
  assert.equal(uint16beAt(2, 0)(frame), false);
  assert.equal(uint32beAt(0, 1)(frame), false);
  assert.equal(minLength(3)(frame), true);
  assert.equal(minLength(4)(frame), false);
  assert.equal(not(minLength(4))(frame), true);
  assert.equal(not(uint8At(0, 1))(frame), false);
});

test('allOf, anyOf e not combinam critérios e interrompem cedo', () => {
  const frame = viewOf([1, 2, 3, 4]);
  const calls: string[] = [];
  const fail = (): boolean => {
    calls.push('fail');
    return false;
  };
  const pass = (): boolean => {
    calls.push('pass');
    return true;
  };
  const later = (): boolean => {
    calls.push('later');
    return true;
  };

  assert.equal(allOf(prefix([1, 2]), uint8At(2, 3))(frame), true);
  assert.equal(allOf(bytesEqual([1, 2, 3, 4]), bytesEqual([9]))(frame), false);
  assert.equal(anyOf(bytesEqual([9]), bytesIncludes([2, 3]))(frame), true);
  assert.equal(anyOf(bytesEqual([9]), prefix([4]))(frame), false);
  assert.equal(allOf()(frame), true);
  assert.equal(anyOf()(frame), false);
  assert.equal(not(anyOf())(frame), true);

  calls.length = 0;
  assert.equal(allOf(fail, later)(frame), false);
  assert.deepEqual(calls, ['fail']);

  calls.length = 0;
  assert.equal(anyOf(pass, later)(frame), true);
  assert.deepEqual(calls, ['pass']);
});

test('predicado composto propaga exceção', () => {
  const boom = (): boolean => {
    throw new Error('predicado');
  };
  assert.throws(() => allOf(boom)(createFrameView(new Uint8Array())), /predicado/);
  assert.throws(() => anyOf(boom)(createFrameView(new Uint8Array())), /predicado/);
});
