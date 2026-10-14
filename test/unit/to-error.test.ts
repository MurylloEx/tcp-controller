import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toError } from '@/to-error';

test('toError preserva Error e converte string', () => {
  const error = new Error('ja existe');
  assert.equal(toError(error), error);
  assert.equal(toError('texto').message, 'texto');
});

test('toError usa mensagem genérica para valores desconhecidos', () => {
  assert.equal(toError(undefined).message, 'Unknown failure.');
  assert.equal(toError(null).message, 'Unknown failure.');
  assert.equal(toError(1).message, 'Unknown failure.');
  assert.equal(toError({}).message, 'Unknown failure.');
});
