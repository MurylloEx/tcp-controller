import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameView } from '@/framing/frame-view';
import {
  DEFAULT_MAX_FRAME_BYTES,
  type ControllerScope,
  type Criterion,
  type EndpointOverride,
  type ErrorSource,
  type FramePredicate,
  type FrameView,
} from '@/types';

test('DEFAULT_MAX_FRAME_BYTES é 1 MiB', () => {
  assert.equal(DEFAULT_MAX_FRAME_BYTES, 1_048_576);
});

test('tipos de contrato aceitam os literais publicados', () => {
  const scope: ControllerScope = 'connection';
  const override: EndpointOverride = { port: 0 };
  const source: ErrorSource = 'framing';
  const predicate: FramePredicate = (frame: FrameView) => frame.byteLength === 0;
  const criterion: Criterion = predicate;
  assert.equal(scope, 'connection');
  assert.deepEqual(override, { port: 0 });
  assert.equal(source, 'framing');
  assert.equal(criterion(createFrameView(new Uint8Array())), true);
});
