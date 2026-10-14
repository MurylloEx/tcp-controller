export type ControllerClass = new () => object;

export type ControllerScope = 'singleton' | 'connection';

export type EndpointConfig = {
  readonly host: string;
  readonly port: number;
};

export type EndpointOverride = {
  readonly host?: string;
  readonly port?: number;
};

export type TlsMaterial = string | Buffer;

export type TlsConfig = {
  readonly cert?: TlsMaterial;
  readonly key?: TlsMaterial;
  readonly ca?: TlsMaterial | readonly TlsMaterial[];
  readonly passphrase?: string;
  readonly requestCert?: boolean;
  readonly rejectUnauthorized?: boolean;
  readonly servername?: string;
  readonly alpnProtocols?: readonly string[];
};

export type StreamConfig = {
  readonly maxFrameBytes: number;
};

export type ListeningAddress = {
  readonly host: string;
  readonly port: number;
};

export type ErrorSource = 'transport' | 'framing' | 'handler';

export type TcpSocket = {
  readonly id: string;
  readonly remoteAddress: string | undefined;
  readonly remotePort: number | undefined;
  readonly localAddress: string | undefined;
  readonly localPort: number | undefined;
  readonly encrypted: boolean;
  readonly authorized: boolean;
  send(payload: Uint8Array): void;
  end(): void;
};

export type TcpContext = {
  readonly socket: TcpSocket | undefined;
  readonly host: string | undefined;
  readonly port: number | undefined;
  readonly hadError: boolean | undefined;
  readonly error: Error | undefined;
  readonly source: ErrorSource | undefined;
  readonly method: string | undefined;
};

export type WhenField = {
  readonly offset: number;
  readonly width: 1 | 2 | 4;
  readonly value: number;
};

export type FrameView = {
  readonly bytes: Uint8Array;
  readonly byteLength: number;
  uint8(offset: number): number;
  uint16be(offset: number): number;
  uint32be(offset: number): number;
  ascii(): string;
};

export type Criterion = (frame: FrameView) => boolean;

export type FramePredicate = Criterion;

export type TcpServerHandle = {
  readonly ready: Promise<ListeningAddress>;
  close(): Promise<void>;
};

export type TcpClientHandle = {
  readonly ready: Promise<TcpSocket>;
  close(): Promise<void>;
};

export const DEFAULT_MAX_FRAME_BYTES = 1_048_576;
