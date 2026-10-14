import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FramingError } from '@/framing/framing-error';

test('FramingError identifica o nome e a mensagem', () => {
  const error = new FramingError('frame grande');
  assert.equal(error.name, 'FramingError');
  assert.equal(error.message, 'frame grande');
  assert.equal(error instanceof Error, true);
  assert.equal(error instanceof FramingError, true);
  assert.throws(() => {
    throw new FramingError('limite');
  }, FramingError);
});
