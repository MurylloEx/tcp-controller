import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPTY_CLASS,
  EMPTY_PROTOTYPE,
  type ClassMetadata,
  type HandlerKind,
  type ParameterKind,
} from '@/metadata/types';

test('EMPTY_CLASS e EMPTY_PROTOTYPE são o metadado padrão congelado', () => {
  const metadata: ClassMetadata = EMPTY_CLASS;
  assert.deepEqual(metadata, {
    endpoint: undefined,
    tls: undefined,
    stream: undefined,
    scope: 'singleton',
  });
  assert.equal(Object.isFrozen(EMPTY_CLASS), true);
  assert.equal(Object.isFrozen(EMPTY_PROTOTYPE), true);
  assert.equal(Object.isFrozen(EMPTY_PROTOTYPE.handlers), true);
  assert.deepEqual([...EMPTY_PROTOTYPE.handlers], []);
});

test('HandlerKind e ParameterKind listam o vocabulário do registro', () => {
  const kinds: readonly HandlerKind[] = [
    'listening',
    'connected',
    'disconnected',
    'error',
    'message',
  ];
  const parameters: readonly ParameterKind[] = [
    'buffer',
    'socket',
    'context',
    'error',
    'hadError',
    'frame',
  ];
  assert.deepEqual(kinds, ['listening', 'connected', 'disconnected', 'error', 'message']);
  assert.deepEqual(parameters, ['buffer', 'socket', 'context', 'error', 'hadError', 'frame']);
});
