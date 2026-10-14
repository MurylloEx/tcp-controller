type Resolvers<T> = {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export type Deferred<T> = Resolvers<T> & {
  readonly promise: Promise<T>;
};

export const deferred = <T>(): Deferred<T> => {
  const resolvers: Resolvers<T> = {
    resolve: () => undefined,
    reject: () => undefined,
  };
  const promise = new Promise<T>((resolve, reject) => {
    resolvers.resolve = resolve;
    resolvers.reject = reject;
  });
  return {
    promise,
    resolve: (value) => {
      resolvers.resolve(value);
    },
    reject: (reason) => {
      resolvers.reject(reason);
    },
  };
};
