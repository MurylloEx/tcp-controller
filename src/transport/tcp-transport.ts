import { connect as connectNet, createServer, type Server } from 'node:net';
import type { EndpointConfig } from '@/types';
import { describe, type ConnectionInfo } from '@/transport/connection';

export const listen = (server: Server, endpoint: EndpointConfig): Promise<Server> =>
  new Promise((resolve, reject) => {
    const failStartup = (error: Error): void => {
      reject(error);
    };
    server.once('error', failStartup);
    server.listen(endpoint.port, endpoint.host, () => {
      server.removeListener('error', failStartup);
      resolve(server);
    });
  });

export const listenTcp = (
  endpoint: EndpointConfig,
  onConnection: (info: ConnectionInfo) => void,
): Promise<Server> => {
  const server = createServer((socket) => {
    socket.setKeepAlive(true);
    onConnection(describe(socket));
  });
  return listen(server, endpoint);
};

export const connectTcp = (endpoint: EndpointConfig): Promise<ConnectionInfo> =>
  new Promise((resolve, reject) => {
    const socket = connectNet({ host: endpoint.host, port: endpoint.port });
    socket.setKeepAlive(true);
    const fail = (error: Error): void => {
      reject(error);
    };
    socket.once('error', fail);
    socket.once('connect', () => {
      socket.removeListener('error', fail);
      resolve(describe(socket));
    });
  });
