import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionTable, type Session } from '@/runtime/sessions';
import type { TcpSocket } from '@/types';

const session = (
  id: string,
  destroyed: string[],
  failure: Session['failure'] = undefined,
): Session => ({
  id,
  socket: { id } as TcpSocket,
  duplex: {
    destroy: (): void => {
      destroyed.push(id);
    },
  } as Session['duplex'],
  pending: new Uint8Array(),
  tail: Promise.resolve(),
  closed: false,
  failure,
  instance: { id },
});

test('SessionTable guarda, substitui, lê e remove', () => {
  const destroyed: string[] = [];
  const table = new SessionTable();
  const first = session('a', destroyed);
  table.save(first);
  table.save(session('b', destroyed));
  assert.equal(table.read('a'), first);
  assert.equal(table.read('ausente'), undefined);

  const snapshot = table.values();
  table.save(session('c', destroyed));
  assert.equal(snapshot.length, 2);
  assert.deepEqual(
    table.values().map((item) => item.id),
    ['a', 'b', 'c'],
  );

  table.save({ ...first, failure: 'framing' });
  assert.equal(table.read('a')?.failure, 'framing');
  assert.equal(table.values().length, 3);

  table.remove('b');
  table.remove('ausente');
  assert.equal(table.read('b'), undefined);
  assert.deepEqual(
    table.values().map((item) => item.id),
    ['a', 'c'],
  );
});

test('destroyAll encerra cada duplex', () => {
  const destroyed: string[] = [];
  const table = new SessionTable();
  table.save(session('a', destroyed));
  table.save(session('b', destroyed));
  table.remove('b');
  table.destroyAll();
  assert.deepEqual(destroyed, ['a']);
  new SessionTable().destroyAll();
});
