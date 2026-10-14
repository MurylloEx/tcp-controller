import type { ErrorSource, TcpContext, TcpSocket } from '@/types';
import type { Invocation } from '@/dispatch/invoke';

export const createContext = (context: TcpContext): TcpContext => Object.freeze({ ...context });

type InvocationFields = {
  readonly frame: Uint8Array | undefined;
  readonly error: Error | undefined;
  readonly hadError: boolean | undefined;
  readonly source: ErrorSource | undefined;
  readonly method: string | undefined;
};

export const connectionInvocation = (socket: TcpSocket, fields: InvocationFields): Invocation => {
  const context = createContext({
    socket,
    host: socket.localAddress,
    port: socket.localPort,
    hadError: fields.hadError,
    error: fields.error,
    source: fields.source,
    method: fields.method,
  });
  return {
    frame: fields.frame,
    view: undefined,
    socket,
    context,
    error: fields.error,
    hadError: fields.hadError,
  };
};

export const listeningInvocation = (host: string, port: number): Invocation => ({
  frame: undefined,
  view: undefined,
  socket: undefined,
  error: undefined,
  hadError: undefined,
  context: createContext({
    socket: undefined,
    host,
    port,
    hadError: undefined,
    error: undefined,
    source: undefined,
    method: undefined,
  }),
});

export const failureInvocation = (
  source: ErrorSource,
  error: Error,
  socket: TcpSocket | undefined,
  method: string | undefined,
): Invocation => ({
  frame: undefined,
  view: undefined,
  socket,
  error,
  hadError: undefined,
  context: createContext({
    socket,
    host: socket?.localAddress,
    port: socket?.localPort,
    hadError: undefined,
    error,
    source,
    method,
  }),
});
