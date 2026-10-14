import type { Server } from 'node:net';

export const text = (frame: Uint8Array): string => Buffer.from(frame).toString('utf8');

export const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error instanceof Error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

export const withTimeout = <T>(promise: Promise<T>, ms = 2_000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('timed out'));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
