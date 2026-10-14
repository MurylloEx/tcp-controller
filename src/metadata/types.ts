import type {
  ControllerClass,
  ControllerScope,
  Criterion,
  EndpointConfig,
  StreamConfig,
  TlsConfig,
  WhenField,
} from '@/types';

export type ParameterKind = 'buffer' | 'socket' | 'context' | 'error' | 'hadError' | 'frame';

export type ParameterBinding = {
  readonly index: number;
  readonly kind: ParameterKind;
};

export type HandlerKind = 'listening' | 'connected' | 'disconnected' | 'error' | 'message';

export type WhenFieldDraft = {
  readonly offset: number;
  readonly width: number;
  readonly value: number;
};

export type WhenDraft = {
  readonly fields: readonly WhenFieldDraft[];
  readonly criteria: readonly Criterion[];
};

export type HandlerDraft = {
  readonly method: string;
  readonly kind: HandlerKind | undefined;
  readonly parameters: readonly ParameterBinding[];
  readonly criteria: readonly Criterion[];
  readonly when?: WhenDraft;
};

export type HandlerDefinition = {
  readonly method: string;
  readonly kind: HandlerKind;
  readonly parameters: readonly ParameterBinding[];
  readonly criteria: readonly Criterion[];
  readonly when?: readonly WhenField[];
};

export type ClassMetadata = {
  readonly endpoint: EndpointConfig | undefined;
  readonly tls: TlsConfig | undefined;
  readonly stream: StreamConfig | undefined;
  readonly scope: ControllerScope;
};

export type PrototypeMetadata = {
  readonly handlers: readonly HandlerDraft[];
};

export type ControllerDefinition = {
  readonly ctor: ControllerClass;
  readonly endpoint: EndpointConfig;
  readonly tls: TlsConfig | undefined;
  readonly stream: StreamConfig | undefined;
  readonly scope: ControllerScope;
  readonly handlers: readonly HandlerDefinition[];
};

export const EMPTY_CLASS: ClassMetadata = Object.freeze({
  endpoint: undefined,
  tls: undefined,
  stream: undefined,
  scope: 'singleton',
});

export const EMPTY_PROTOTYPE: PrototypeMetadata = Object.freeze({
  handlers: Object.freeze([]),
});
