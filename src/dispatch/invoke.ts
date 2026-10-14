import { createFrameView } from '@/framing/frame-view';
import type { HandlerDefinition, ParameterKind } from '@/metadata/types';
import { toError } from '@/to-error';
import type { FrameView, TcpContext, TcpSocket, WhenField } from '@/types';

export type Invocation = {
  readonly frame: Uint8Array | undefined;
  readonly view: FrameView | undefined;
  readonly socket: TcpSocket | undefined;
  readonly context: TcpContext;
  readonly error: Error | undefined;
  readonly hadError: boolean | undefined;
};

const valueFor = (kind: ParameterKind, invocation: Invocation): unknown => {
  const values: Record<ParameterKind, unknown> = {
    buffer: invocation.frame,
    frame: invocation.view,
    socket: invocation.socket,
    context: invocation.context,
    error: invocation.error,
    hadError: invocation.hadError,
  };
  return values[kind];
};

const methodOf = (instance: object, name: string): ((...args: readonly unknown[]) => unknown) => {
  const method = (instance as Record<string, unknown>)[name];
  if (typeof method !== 'function') {
    throw new Error(`Member ${name} is not a method.`);
  }
  return method as (...args: readonly unknown[]) => unknown;
};

export const invoke = async (
  instance: object,
  handler: HandlerDefinition,
  invocation: Invocation,
): Promise<void> => {
  const method = methodOf(instance, handler.method);
  const arity = handler.parameters.reduce((max, binding) => Math.max(max, binding.index + 1), 0);
  const args = Array.from({ length: arity }, (_, index) => {
    const binding = handler.parameters.find((item) => item.index === index);
    return binding === undefined ? undefined : valueFor(binding.kind, invocation);
  });
  await method.apply(instance, args);
};

export const callHandlers = async (
  instance: object,
  handlers: readonly HandlerDefinition[],
  invocation: Invocation,
  onHandlerError: (error: Error, method: string) => void,
): Promise<void> => {
  await handlers.reduce<Promise<void>>(async (previous, handler) => {
    await previous;
    try {
      await invoke(instance, handler, invocation);
    } catch (error) {
      onHandlerError(toError(error), handler.method);
    }
  }, Promise.resolve());
};

const accepts = (handler: HandlerDefinition, view: FrameView): boolean | Error => {
  try {
    return handler.criteria.every((predicate) => predicate(view));
  } catch (error) {
    return toError(error);
  }
};

const deliver = async (
  instance: object,
  handlers: readonly HandlerDefinition[],
  view: FrameView,
  invocation: Invocation,
  onHandlerError: (error: Error, method: string) => void,
): Promise<void> => {
  await handlers.reduce<Promise<void>>(async (previous, handler) => {
    await previous;
    const accepted = accepts(handler, view);
    if (accepted instanceof Error) {
      onHandlerError(accepted, handler.method);
      return;
    }
    if (!accepted) {
      return;
    }
    try {
      await invoke(instance, handler, invocation);
    } catch (error) {
      onHandlerError(toError(error), handler.method);
    }
  }, Promise.resolve());
};

const READER = {
  1: (frame: FrameView, offset: number): number => frame.uint8(offset),
  2: (frame: FrameView, offset: number): number => frame.uint16be(offset),
  4: (frame: FrameView, offset: number): number => frame.uint32be(offset),
} as const;

const fieldMatches = (frame: FrameView, field: WhenField): boolean =>
  Number.isInteger(field.offset) &&
  field.offset >= 0 &&
  field.offset + field.width <= frame.byteLength &&
  READER[field.width](frame, field.offset) === field.value;

const matchesFields = (handler: HandlerDefinition, frame: FrameView): boolean =>
  (handler.when ?? []).every((field) => fieldMatches(frame, field));

// The first @TcpWhen whose fields all match and whose criteria all pass runs alone.
// A field that does not fit, a value that differs, or a criterion that returns false
// skips that handler. A criterion that throws is reported and stops the chain.
// If no @TcpWhen matches, plain @TcpMessage methods are the fallback.
const runWhen = async (
  instance: object,
  handlers: readonly HandlerDefinition[],
  view: FrameView,
  invocation: Invocation,
  onHandlerError: (error: Error, method: string) => void,
): Promise<boolean> => {
  const [head, ...rest] = handlers;
  if (head === undefined) {
    return false;
  }
  if (!matchesFields(head, view)) {
    return runWhen(instance, rest, view, invocation, onHandlerError);
  }
  const accepted = accepts(head, view);
  if (accepted instanceof Error) {
    onHandlerError(accepted, head.method);
    return true;
  }
  if (!accepted) {
    return runWhen(instance, rest, view, invocation, onHandlerError);
  }
  try {
    await invoke(instance, head, invocation);
  } catch (error) {
    onHandlerError(toError(error), head.method);
  }
  return true;
};

export const callMessages = async (
  instance: object,
  handlers: readonly HandlerDefinition[],
  frame: Uint8Array,
  invocation: Invocation,
  onHandlerError: (error: Error, method: string) => void,
): Promise<void> => {
  const view = createFrameView(frame);
  const next = { ...invocation, frame, view };
  const taken = await runWhen(
    instance,
    handlers.filter((handler) => handler.when !== undefined),
    view,
    next,
    onHandlerError,
  );
  if (taken) {
    return;
  }
  await deliver(
    instance,
    handlers.filter((handler) => handler.when === undefined),
    view,
    next,
    onHandlerError,
  );
};
