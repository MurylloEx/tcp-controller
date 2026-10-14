import type { Server } from 'node:net';
import type { FrameCodec } from '@/framing/codec';
import { createLengthPrefixCodec } from '@/framing/length-prefix-codec';
import { createRawCodec } from '@/framing/raw-codec';
import { readController } from '@/metadata/registry';
import type { ControllerDefinition } from '@/metadata/types';
import { callHandlers } from '@/dispatch/invoke';
import { toError } from '@/to-error';
import type {
  ControllerClass,
  EndpointConfig,
  EndpointOverride,
  ListeningAddress,
  TcpClientHandle,
  TcpServerHandle,
} from '@/types';
import { connectTcp, listenTcp } from '@/transport/tcp-transport';
import { listenTls, openTls } from '@/transport/tls-transport';
import type { ConnectionInfo } from '@/transport/connection';
import { attach, createReporter } from '@/runtime/connection';
import { listeningInvocation } from '@/runtime/context';
import { SessionTable } from '@/runtime/sessions';

const resolveEndpoint = (
  endpoint: EndpointConfig,
  override: EndpointOverride | undefined,
): EndpointConfig => ({
  host: override?.host ?? endpoint.host,
  port: override?.port ?? endpoint.port,
});

const codecFor = (definition: ControllerDefinition): FrameCodec =>
  definition.stream === undefined
    ? createRawCodec()
    : createLengthPrefixCodec(definition.stream.maxFrameBytes);

const openListener = (
  definition: ControllerDefinition,
  endpoint: EndpointConfig,
  onConnection: (info: ConnectionInfo) => void,
): Promise<Server> =>
  definition.tls === undefined
    ? listenTcp(endpoint, onConnection)
    : listenTls(endpoint, definition.tls, onConnection);

const openClient = (
  definition: ControllerDefinition,
  endpoint: EndpointConfig,
): Promise<ConnectionInfo> =>
  definition.tls === undefined ? connectTcp(endpoint) : openTls(endpoint, definition.tls);

const boundAddress = (server: Server): ListeningAddress => {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Listening address unavailable.');
  }
  return { host: address.address, port: address.port };
};

const once = (job: () => Promise<void>): (() => Promise<void>) => {
  const gate: { pending: Promise<void> | undefined } = { pending: undefined };
  return () => {
    if (gate.pending !== undefined) {
      return gate.pending;
    }
    const pending = job();
    gate.pending = pending;
    return pending;
  };
};

export const createServer = (
  controller: ControllerClass,
  override?: EndpointOverride,
): TcpServerHandle => {
  const definition = readController(controller);
  const endpoint = resolveEndpoint(definition.endpoint, override);
  const codec = codecFor(definition);
  const singleton = new definition.ctor();
  const table = new SessionTable();
  const report = createReporter(definition);
  const started = openListener(definition, endpoint, (info) => {
    attach({ info, definition, codec, singleton, table, report });
  }).then((server) => {
    server.on('error', (error: Error) => {
      report({ source: 'transport', error, socket: undefined, method: undefined }, singleton);
    });
    const address = boundAddress(server);
    void callHandlers(
      singleton,
      definition.handlers.filter((handler) => handler.kind === 'listening'),
      listeningInvocation(address.host, address.port),
      (error, method) => {
        report({ source: 'handler', error, socket: undefined, method }, singleton);
      },
    );
    return { server, address };
  });

  return {
    ready: started.then(({ address }) => address),
    close: once(() =>
      started
        .then(
          ({ server }) =>
            new Promise<void>((resolve, reject) => {
              table.destroyAll();
              server.close((error) => {
                if (error instanceof Error) {
                  reject(error);
                  return;
                }
                resolve();
              });
            }),
          () => undefined,
        )
        .then(() => undefined),
    ),
  };
};

export const connect = (
  controller: ControllerClass,
  override?: EndpointOverride,
): TcpClientHandle => {
  const definition = readController(controller);
  const endpoint = resolveEndpoint(definition.endpoint, override);
  const codec = codecFor(definition);
  const singleton = new definition.ctor();
  const table = new SessionTable();
  const report = createReporter(definition);
  const started = openClient(definition, endpoint).then(
    (info) => attach({ info, definition, codec, singleton, table, report }),
    (error: unknown) => {
      const failure = toError(error);
      report(
        { source: 'transport', error: failure, socket: undefined, method: undefined },
        singleton,
      );
      throw failure;
    },
  );

  return {
    ready: started,
    close: once(() =>
      started
        .then(
          (socket) => {
            table.read(socket.id)?.duplex.destroy();
          },
          () => undefined,
        )
        .then(() => undefined),
    ),
  };
};
