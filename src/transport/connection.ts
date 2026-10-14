import { TLSSocket } from 'node:tls';
import type { Socket } from 'node:net';

export type SocketLike = Socket | TLSSocket;

export type ConnectionInfo = {
  readonly duplex: SocketLike;
  readonly remoteAddress: string | undefined;
  readonly remotePort: number | undefined;
  readonly localAddress: string | undefined;
  readonly localPort: number | undefined;
  readonly encrypted: boolean;
  readonly authorized: boolean;
};

export const describe = (socket: SocketLike): ConnectionInfo => ({
  duplex: socket,
  remoteAddress: socket.remoteAddress,
  remotePort: socket.remotePort,
  localAddress: socket.localAddress,
  localPort: socket.localPort,
  encrypted: socket instanceof TLSSocket ? socket.encrypted : false,
  authorized: socket instanceof TLSSocket ? socket.authorized : false,
});
