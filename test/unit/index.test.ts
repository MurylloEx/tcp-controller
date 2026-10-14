import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '@/index';
import { FramingError } from '@/framing/framing-error';
import { DEFAULT_MAX_FRAME_BYTES } from '@/types';

const expected = [
  'DEFAULT_MAX_FRAME_BYTES',
  'FramingError',
  'TcpBuffer',
  'TcpClientConnected',
  'TcpClientDisconnected',
  'TcpContext',
  'TcpController',
  'TcpCriteria',
  'TcpError',
  'TcpException',
  'TcpFrame',
  'TcpHadError',
  'TcpListening',
  'TcpMessage',
  'TcpMessageStream',
  'TcpScope',
  'TcpSecure',
  'TcpSocket',
  'TcpWhen',
  'allOf',
  'anyOf',
  'bytesEqual',
  'bytesIncludes',
  'connect',
  'createFrameView',
  'createServer',
  'minLength',
  'not',
  'prefix',
  'uint16beAt',
  'uint32beAt',
  'uint8At',
];

test('o barrel publica os valores de runtime', () => {
  const names = Object.keys(api)
    .filter((key) => key !== '__esModule')
    .sort();
  assert.deepEqual(names, expected);
  assert.equal(api.DEFAULT_MAX_FRAME_BYTES, DEFAULT_MAX_FRAME_BYTES);
  assert.equal(api.FramingError, FramingError);
  assert.equal(typeof api.createServer, 'function');
  assert.equal(typeof api.connect, 'function');
  assert.equal(typeof api.TcpController, 'function');
  assert.equal(new api.FramingError('x').name, 'FramingError');
  const text = (value: string) => api.createFrameView(Buffer.from(value));
  assert.equal(api.bytesEqual(Buffer.from('z'))(text('z')), true);
  assert.equal(api.bytesIncludes(Buffer.from('bc'))(text('abcd')), true);
  assert.equal(api.prefix(Buffer.from('ab'))(text('abcd')), true);
  assert.equal(api.allOf(api.bytesEqual(Buffer.from('a')))(text('a')), true);
  assert.equal(api.anyOf(api.bytesEqual(Buffer.from('a')), api.uint8At(0, 0x62))(text('b')), true);
  assert.equal(api.not(api.minLength(2))(text('b')), true);
});
