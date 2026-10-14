import type { ControllerClass, EndpointConfig, WhenField } from '@/types';
import {
  EMPTY_CLASS,
  EMPTY_PROTOTYPE,
  type ClassMetadata,
  type ControllerDefinition,
  type HandlerDefinition,
  type HandlerDraft,
  type ParameterBinding,
  type PrototypeMetadata,
  type WhenDraft,
  type WhenFieldDraft,
} from '@/metadata/types';

const classes = new WeakMap<object, ClassMetadata>();
const prototypes = new WeakMap<object, PrototypeMetadata>();

const WIDTH_LIMIT = Object.freeze({
  1: 0xff,
  2: 0xffff,
  4: 0xffff_ffff,
});

const classOf = (target: object): ClassMetadata => classes.get(target) ?? EMPTY_CLASS;

const prototypeOf = (target: object): PrototypeMetadata =>
  prototypes.get(target) ?? EMPTY_PROTOTYPE;

export const writeClass = (target: object, next: ClassMetadata): void => {
  classes.set(target, next);
};

export const readClass = (target: object): ClassMetadata => classOf(target);

export const updateHandler = (
  target: object,
  method: string,
  patch: (draft: HandlerDraft) => HandlerDraft,
): void => {
  const current = prototypeOf(target);
  const existing = current.handlers.find((handler) => handler.method === method);
  const base: HandlerDraft = existing ?? {
    method,
    kind: undefined,
    parameters: [],
    criteria: [],
  };
  const next = patch(base);
  const handlers = existing
    ? current.handlers.map((handler) => (handler.method === method ? next : handler))
    : [...current.handlers, next];
  prototypes.set(target, { handlers });
};

export const replaceParameters = (
  parameters: readonly ParameterBinding[],
  binding: ParameterBinding,
): readonly ParameterBinding[] => [
  ...parameters.filter((item) => item.index !== binding.index),
  binding,
];

const isWidth = (width: number): width is 1 | 2 | 4 => width === 1 || width === 2 || width === 4;

const freezeField = (method: string, field: WhenFieldDraft): WhenField => {
  if (!Number.isInteger(field.offset) || field.offset < 0) {
    throw new Error(`Invalid @TcpWhen offset on ${method}: ${field.offset}.`);
  }
  if (!isWidth(field.width)) {
    throw new Error(`Invalid @TcpWhen width on ${method}: ${field.width}.`);
  }
  const limit = WIDTH_LIMIT[field.width];
  if (!Number.isInteger(field.value) || field.value < 0 || field.value > limit) {
    throw new Error(`@TcpWhen value does not fit width ${field.width}: ${method}=${field.value}.`);
  }
  return Object.freeze({ offset: field.offset, width: field.width, value: field.value });
};

const publishWhen = (method: string, when: WhenDraft): readonly WhenField[] =>
  Object.freeze(when.fields.map((field) => freezeField(method, field)));

const publish = (draft: HandlerDraft): HandlerDefinition | undefined => {
  if (draft.kind === undefined) {
    return undefined;
  }
  const when = draft.when === undefined ? undefined : publishWhen(draft.method, draft.when);
  return Object.freeze({
    method: draft.method,
    kind: draft.kind,
    parameters: Object.freeze([...draft.parameters]),
    criteria: Object.freeze([...draft.criteria]),
    ...(when === undefined ? {} : { when }),
  });
};

const methodNames = (handlers: readonly HandlerDefinition[]): string =>
  handlers.map((handler) => handler.method).join(', ');

const assertWhen = (handlers: readonly HandlerDefinition[]): void => {
  const misplaced = handlers.filter(
    (handler) => handler.when !== undefined && handler.kind !== 'message',
  );
  if (misplaced.length === 0) {
    return;
  }
  throw new Error(`@TcpWhen requires @TcpMessage: ${methodNames(misplaced)}.`);
};

const bareWhen = (draft: HandlerDraft): boolean =>
  draft.when !== undefined && draft.when.fields.length === 0 && draft.when.criteria.length === 0;

const prototypesOf = (ctor: ControllerClass): readonly object[] => {
  const parent = Object.getPrototypeOf(ctor.prototype) as object | null;
  if (parent === null || parent === Object.prototype) {
    return [ctor.prototype as object];
  }
  return [...prototypesOf(parent.constructor as ControllerClass), ctor.prototype as object];
};

const mergeHandlers = (layers: readonly PrototypeMetadata[]): readonly HandlerDefinition[] =>
  layers.reduce<readonly HandlerDefinition[]>((accumulated, layer) => {
    const bare = layer.handlers
      .filter(bareWhen)
      .map((draft) => draft.method)
      .join(', ');
    if (bare.length > 0) {
      throw new Error(`@TcpWhen() on ${bare} requires a field or a criterion.`);
    }
    const orphans = layer.handlers.filter(
      (draft) =>
        draft.kind === undefined &&
        (draft.criteria.length > 0 || draft.parameters.length > 0 || draft.when !== undefined),
    );
    if (orphans.length > 0) {
      throw new Error(
        `Methods missing a lifecycle decorator: ${orphans.map((draft) => draft.method).join(', ')}.`,
      );
    }
    const own = layer.handlers.flatMap((draft) => {
      const handler = publish(draft);
      return handler === undefined ? [] : [handler];
    });
    const replaced = new Set(own.map((handler) => handler.method));
    return [...accumulated.filter((handler) => !replaced.has(handler.method)), ...own];
  }, []);

export const readController = (ctor: ControllerClass): ControllerDefinition => {
  const metadata = classOf(ctor);
  if (metadata.endpoint === undefined) {
    throw new Error('Class requires @TcpController(host, port).');
  }
  const endpoint: EndpointConfig = metadata.endpoint;
  const handlers = mergeHandlers(prototypesOf(ctor).map(prototypeOf));
  assertWhen(handlers);
  return Object.freeze({
    ctor,
    endpoint,
    tls: metadata.tls,
    stream: metadata.stream,
    scope: metadata.scope,
    handlers: Object.freeze(handlers),
  });
};
