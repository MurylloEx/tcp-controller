import type { SocketLike } from '@/transport/connection';
import type { ErrorSource, TcpSocket } from '@/types';

export type Session = {
  readonly id: string;
  readonly socket: TcpSocket;
  readonly duplex: SocketLike;
  readonly pending: Uint8Array;
  readonly tail: Promise<void>;
  readonly closed: boolean;
  readonly failure: ErrorSource | undefined;
  readonly instance: object;
};

export class SessionTable {
  private readonly sessions = new Map<string, Session>();

  public save(session: Session): void {
    this.sessions.set(session.id, session);
  }

  public read(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  public remove(id: string): void {
    this.sessions.delete(id);
  }

  public values(): readonly Session[] {
    return [...this.sessions.values()];
  }

  public destroyAll(): void {
    this.values().forEach((session) => {
      session.duplex.destroy();
    });
  }
}
