import {
  connect as connectTls,
  createServer as createTlsServer,
  type ConnectionOptions,
  type TlsOptions,
} from 'node:tls';
import type { EndpointConfig, TlsConfig, TlsMaterial } from '@/types';
import { describe, type ConnectionInfo } from '@/transport/connection';
import { listen } from '@/transport/tcp-transport';

const copyList = (values: readonly string[]): string[] => [...values];

const copyMaterial = (
  material: TlsMaterial | readonly TlsMaterial[],
): string | Buffer | Array<string | Buffer> => {
  if (typeof material === 'string' || Buffer.isBuffer(material)) {
    return material;
  }
  return [...material];
};

const serverOptions = (config: TlsConfig): TlsOptions => {
  if (config.cert === undefined || config.key === undefined) {
    throw new Error('TLS server requires cert and key in @TcpSecure.');
  }
  return {
    cert: config.cert,
    key: config.key,
    ...(config.ca === undefined ? {} : { ca: copyMaterial(config.ca) }),
    ...(config.passphrase === undefined ? {} : { passphrase: config.passphrase }),
    ...(config.requestCert === undefined ? {} : { requestCert: config.requestCert }),
    ...(config.rejectUnauthorized === undefined
      ? {}
      : { rejectUnauthorized: config.rejectUnauthorized }),
    ...(config.alpnProtocols === undefined
      ? {}
      : { ALPNProtocols: copyList(config.alpnProtocols) }),
  };
};

const clientOptions = (endpoint: EndpointConfig, config: TlsConfig): ConnectionOptions => ({
  host: endpoint.host,
  port: endpoint.port,
  servername: config.servername ?? endpoint.host,
  ...(config.cert === undefined ? {} : { cert: config.cert }),
  ...(config.key === undefined ? {} : { key: config.key }),
  ...(config.ca === undefined ? {} : { ca: copyMaterial(config.ca) }),
  ...(config.passphrase === undefined ? {} : { passphrase: config.passphrase }),
  ...(config.rejectUnauthorized === undefined
    ? {}
    : { rejectUnauthorized: config.rejectUnauthorized }),
  ...(config.alpnProtocols === undefined ? {} : { ALPNProtocols: copyList(config.alpnProtocols) }),
});

export const listenTls = (
  endpoint: EndpointConfig,
  config: TlsConfig,
  onConnection: (info: ConnectionInfo) => void,
): Promise<import('node:net').Server> => {
  const server = createTlsServer(serverOptions(config));
  server.on('secureConnection', (socket) => {
    socket.setKeepAlive(true);
    onConnection(describe(socket));
  });
  return listen(server, endpoint);
};

export const openTls = (endpoint: EndpointConfig, config: TlsConfig): Promise<ConnectionInfo> =>
  new Promise((resolve, reject) => {
    const socket = connectTls(clientOptions(endpoint, config));
    socket.setKeepAlive(true);
    const fail = (error: Error): void => {
      reject(error);
    };
    socket.once('error', fail);
    socket.once('secureConnect', () => {
      socket.removeListener('error', fail);
      resolve(describe(socket));
    });
  });
