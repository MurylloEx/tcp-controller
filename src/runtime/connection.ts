import type { HandlerDefinition } from '@/metadata/types';
import { toError } from '@/to-error';
import type { ControllerDefinition } from '@/metadata/types';
import type { FrameCodec } from '@/framing/codec';
import type { ConnectionInfo } from '@/transport/connection';
import type { ErrorSource, TcpSocket } from '@/types';
import { callHandlers, callMessages } from '@/dispatch/invoke';
import { createTcpSocket } from '@/socket/tcp-socket';
import { connectionInvocation, failureInvocation } from '@/runtime/context';
import { type Session, type SessionTable } from '@/runtime/sessions';

export type Failure = {
  readonly source: ErrorSource;
  readonly error: Error;
  readonly socket: TcpSocket | undefined;
  readonly method: string | undefined;
};

export type FailureReporter = (failure: Failure, instance: object) => void;

const activeReports = new Set<string>();

export const createReporter =
  (definition: ControllerDefinition): FailureReporter =>
  (failure, instance) => {
    const key = `${failure.socket?.id ?? 'listener'}:${failure.source}:${failure.method ?? '-'}`;
    if (activeReports.has(key)) {
      process.stderr.write(`tcp-controller: reentrant error in ${key}: ${failure.error.message}\n`);
      return;
    }
    activeReports.add(key);
    const handlers = definition.handlers.filter((handler) => handler.kind === 'error');
    void callHandlers(
      instance,
      handlers,
      failureInvocation(failure.source, failure.error, failure.socket, failure.method),
      (error, method) => {
        process.stderr.write(`tcp-controller: @TcpError ${method} failed: ${error.message}\n`);
      },
    ).finally(() => {
      activeReports.delete(key);
    });
  };

const byKind = (
  definition: ControllerDefinition,
  kind: HandlerDefinition['kind'],
): readonly HandlerDefinition[] => definition.handlers.filter((handler) => handler.kind === kind);

const blank = {
  frame: undefined,
  error: undefined,
  hadError: undefined,
  source: undefined,
  method: undefined,
} as const;

export const attach = (options: {
  readonly info: ConnectionInfo;
  readonly definition: ControllerDefinition;
  readonly codec: FrameCodec;
  readonly singleton: object;
  readonly table: SessionTable;
  readonly report: FailureReporter;
}): TcpSocket => {
  const socket = createTcpSocket(options.info, options.codec);
  const instance =
    options.definition.scope === 'connection' ? new options.definition.ctor() : options.singleton;
  const initial: Session = {
    id: socket.id,
    socket,
    duplex: options.info.duplex,
    pending: new Uint8Array(0),
    tail: Promise.resolve(),
    closed: false,
    failure: undefined,
    instance,
  };
  options.table.save(initial);
  const messages = byKind(options.definition, 'message');
  const onHandlerError = (error: Error, method: string): void => {
    options.report({ source: 'handler', error, socket, method }, instance);
  };
  const markFailure = (session: Session, source: ErrorSource, error: Error): void => {
    const latest = options.table.read(session.id);
    if (latest === undefined || latest.failure !== undefined) {
      return;
    }
    options.table.save({ ...latest, failure: source });
    options.report({ source, error, socket: latest.socket, method: undefined }, latest.instance);
    if (source === 'framing') {
      latest.duplex.destroy();
    }
  };
  const deliverFrame = (session: Session, frame: Uint8Array): Promise<void> => {
    const latest = options.table.read(session.id);
    if (latest === undefined || latest.failure !== undefined || latest.closed) {
      return Promise.resolve();
    }
    return callMessages(
      latest.instance,
      messages,
      frame,
      connectionInvocation(latest.socket, { ...blank, frame }),
      onHandlerError,
    );
  };

  options.info.duplex.on('data', (chunk: Buffer) => {
    const current = options.table.read(socket.id);
    if (current === undefined || current.failure !== undefined || current.closed) {
      return;
    }
    try {
      const decoded = options.codec.decode(current.pending, chunk);
      const tail = decoded.frames.reduce<Promise<void>>(
        (previous, frame) =>
          previous.then(
            () => deliverFrame(current, frame),
            () => deliverFrame(current, frame),
          ),
        current.tail,
      );
      options.table.save({ ...current, pending: decoded.pending, tail });
    } catch (error) {
      markFailure(current, 'framing', toError(error));
    }
  });

  options.info.duplex.on('error', (error: Error) => {
    const current = options.table.read(socket.id);
    if (current === undefined) {
      return;
    }
    markFailure(current, 'transport', error);
  });

  options.info.duplex.on('close', (hadError: boolean) => {
    const current = options.table.read(socket.id);
    if (current === undefined || current.closed) {
      return;
    }
    options.table.save({ ...current, closed: true });
    options.table.remove(socket.id);
    void callHandlers(
      current.instance,
      byKind(options.definition, 'disconnected'),
      connectionInvocation(current.socket, { ...blank, hadError }),
      onHandlerError,
    );
  });

  void callHandlers(
    instance,
    byKind(options.definition, 'connected'),
    connectionInvocation(socket, blank),
    onHandlerError,
  );

  return socket;
};
