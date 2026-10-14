import { randomUUID } from 'node:crypto';
import type { FrameCodec } from '@/framing/codec';
import type { TcpSocket } from '@/types';
import type { ConnectionInfo } from '@/transport/connection';

export const createTcpSocket = (info: ConnectionInfo, codec: FrameCodec): TcpSocket =>
  Object.freeze({
    id: randomUUID(),
    remoteAddress: info.remoteAddress,
    remotePort: info.remotePort,
    localAddress: info.localAddress,
    localPort: info.localPort,
    encrypted: info.encrypted,
    authorized: info.authorized,
    send: (payload: Uint8Array): void => {
      info.duplex.write(codec.encode(payload));
    },
    end: (): void => {
      info.duplex.end();
    },
  });
