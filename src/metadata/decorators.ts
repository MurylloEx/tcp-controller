import {
  DEFAULT_MAX_FRAME_BYTES,
  type ControllerScope,
  type Criterion,
  type TcpContext as TcpContextShape,
  type TcpSocket as TcpSocketShape,
  type TlsConfig,
  type WhenField,
} from '@/types';
import { readClass, replaceParameters, updateHandler, writeClass } from '@/metadata/registry';
import type { HandlerKind, ParameterKind, WhenFieldDraft } from '@/metadata/types';

export type {
  ControllerScope,
  Criterion,
  EndpointOverride,
  ErrorSource,
  FramePredicate,
  FrameView,
  ListeningAddress,
  TcpClientHandle,
  TcpServerHandle,
  TlsConfig,
  WhenField,
} from '@/types';

export type TcpContext = TcpContextShape;
export type TcpSocket = TcpSocketShape;

const assertHost = (host: string): void => {
  if (host.trim().length === 0) {
    throw new Error('Empty TCP host.');
  }
};

const assertPort = (port: number): void => {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid TCP port: ${port}.`);
  }
};

const assertMaxFrame = (maxFrameBytes: number): void => {
  if (!Number.isInteger(maxFrameBytes) || maxFrameBytes <= 0) {
    throw new Error(`Invalid frame limit: ${maxFrameBytes}.`);
  }
};

const isInstanceTarget = (
  target: object,
  propertyKey: string | symbol | undefined,
): propertyKey is string => typeof target !== 'function' && typeof propertyKey === 'string';

const setKind =
  (kind: HandlerKind): MethodDecorator =>
  (target, propertyKey) => {
    if (!isInstanceTarget(target, propertyKey)) {
      return;
    }
    updateHandler(target, propertyKey, (draft) => ({ ...draft, kind }));
  };

const bindParameter =
  (kind: ParameterKind): ParameterDecorator =>
  (target, propertyKey, index) => {
    if (!isInstanceTarget(target, propertyKey)) {
      return;
    }
    updateHandler(target, propertyKey, (draft) => ({
      ...draft,
      parameters: replaceParameters(draft.parameters, { index, kind }),
    }));
  };

export const TcpController =
  (host: string, port: number): ClassDecorator =>
  (target) => {
    assertHost(host);
    assertPort(port);
    writeClass(target, { ...readClass(target), endpoint: Object.freeze({ host, port }) });
  };

export const TcpSecure =
  (tls: TlsConfig): ClassDecorator =>
  (target) => {
    writeClass(target, { ...readClass(target), tls: Object.freeze({ ...tls }) });
  };

export const TcpMessageStream =
  (options?: { readonly maxFrameBytes?: number }): ClassDecorator =>
  (target) => {
    const maxFrameBytes = options?.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    assertMaxFrame(maxFrameBytes);
    writeClass(target, { ...readClass(target), stream: Object.freeze({ maxFrameBytes }) });
  };

export const TcpScope =
  (scope: ControllerScope): ClassDecorator =>
  (target) => {
    writeClass(target, { ...readClass(target), scope });
  };

export const TcpListening = (): MethodDecorator => setKind('listening');

export const TcpClientConnected = (): MethodDecorator => setKind('connected');

export const TcpClientDisconnected = (): MethodDecorator => setKind('disconnected');

export const TcpError = (): MethodDecorator => setKind('error');

export const TcpMessage = (): MethodDecorator => setKind('message');

const copyField = (field: WhenField): WhenFieldDraft => {
  const source = field as Partial<WhenField> | null;
  return Object.freeze({
    offset: typeof source?.offset === 'number' ? source.offset : Number.NaN,
    width: typeof source?.width === 'number' ? source.width : Number.NaN,
    value: typeof source?.value === 'number' ? source.value : Number.NaN,
  });
};

const isCriterion = (part: WhenField | Criterion): part is Criterion => typeof part === 'function';

export const TcpWhen =
  (...parts: readonly (WhenField | Criterion)[]): MethodDecorator =>
  (target, propertyKey) => {
    if (!isInstanceTarget(target, propertyKey)) {
      return;
    }
    const fields = parts.flatMap((part) => (isCriterion(part) ? [] : [copyField(part)]));
    const criteria = parts.filter(isCriterion);
    updateHandler(target, propertyKey, (draft) => ({
      ...draft,
      when: Object.freeze({
        fields: Object.freeze(fields),
        criteria: Object.freeze([...criteria]),
      }),
      criteria: [...draft.criteria, ...criteria],
    }));
  };

export const TcpCriteria =
  (predicate: Criterion): MethodDecorator =>
  (target, propertyKey) => {
    if (!isInstanceTarget(target, propertyKey)) {
      return;
    }
    updateHandler(target, propertyKey, (draft) => ({
      ...draft,
      criteria: [...draft.criteria, predicate],
    }));
  };

export const TcpBuffer = (): ParameterDecorator => bindParameter('buffer');

export const TcpFrame = (): ParameterDecorator => bindParameter('frame');

export const TcpSocket = (): ParameterDecorator => bindParameter('socket');

export const TcpContext = (): ParameterDecorator => bindParameter('context');

export const TcpHadError = (): ParameterDecorator => bindParameter('hadError');

export const TcpException = (): ParameterDecorator => bindParameter('error');
