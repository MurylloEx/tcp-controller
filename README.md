# TCP Controller

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/murylloex)

TCP and TLS gateway described with decorators. You mark a class with an endpoint, optional TLS and framing, and methods for the connection lifecycle. `createServer` and `connect` build one controller and dispatch each event with a frozen context, the socket, and the frame for that call.

There are no runtime dependencies. Transport uses `node:net` and `node:tls`. Framing and decorator metadata stay inside the package.

The controller is constructed with `new` and no arguments. Each `createServer` or `connect` call has its own instance, codec, and sessions.

## Installation

```bash
npm install tcp-controller
```

Node.js 18 or newer (`engines.node` is `>=18`). The published package ships CommonJS and ESM together:

| Import style                     | Runtime    | Types                 |
| -------------------------------- | ---------- | --------------------- |
| `require("tcp-controller")`      | `dist/cjs` | `dist/cjs/index.d.ts` |
| `import … from "tcp-controller"` | `dist/esm` | `dist/esm/index.d.ts` |

Decorator syntax is TypeScript's legacy decorators. Compile controllers with `experimentalDecorators` enabled. This package is built with `useDefineForClassFields` set to `false`.

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

## Imports

CommonJS, after the controller file has been compiled:

```js
const { connect, createServer } = require('tcp-controller');
```

TypeScript or native ESM:

```ts
import { connect, createServer } from 'tcp-controller';
```

The same entry point exports the decorators, `createFrameView`, the byte criteria (`bytesEqual`, `prefix`, `bytesIncludes`, `uint8At`, `uint16beAt`, `uint32beAt`, `minLength`, `allOf`, `anyOf`, `not`), `FramingError`, and `DEFAULT_MAX_FRAME_BYTES`.

## Server and client

`@TcpController(host, port)` stores the default endpoint. An empty or whitespace-only host throws `Empty TCP host.` A port that is not an integer from `0` through `65535` throws `Invalid TCP port: …`. Port `0` asks the operating system for a free port; read the chosen port from `server.ready`.

`@TcpMessageStream()` frames messages with a big-endian `uint32` length prefix. The example below uses it on both peers so each `send` becomes one message.

```ts
import {
  bytesIncludes,
  connect,
  createServer,
  TcpBuffer,
  TcpClientConnected,
  TcpClientDisconnected,
  TcpContext,
  TcpController,
  TcpCriteria,
  TcpError,
  TcpException,
  TcpListening,
  TcpMessage,
  TcpMessageStream,
  TcpSocket,
} from 'tcp-controller';

@TcpController('0.0.0.0', 1337)
@TcpMessageStream({ maxFrameBytes: 1024 * 1024 })
class ChatServer {
  @TcpListening()
  onListening(@TcpContext() context: TcpContext): void {
    console.log(`listening ${context.host}:${context.port}`);
  }

  @TcpClientConnected()
  onConnect(@TcpSocket() socket: TcpSocket): void {
    socket.send(Buffer.from('hello'));
  }

  @TcpCriteria(bytesIncludes(Buffer.from('ping')))
  @TcpMessage()
  onPing(@TcpBuffer() frame: Uint8Array, @TcpSocket() socket: TcpSocket): void {
    socket.send(frame);
  }

  @TcpClientDisconnected()
  onDisconnect(@TcpContext() context: TcpContext): void {
    console.log(`left ${context.socket?.id}`);
  }

  @TcpError()
  onError(@TcpContext() context: TcpContext, @TcpException() error: Error): void {
    console.error(context.source, context.method, error.message);
  }
}

@TcpController('127.0.0.1', 1337)
@TcpMessageStream()
class ChatClient {
  @TcpClientConnected()
  onConnect(@TcpSocket() socket: TcpSocket): void {
    socket.send(Buffer.from('ping'));
  }

  @TcpMessage()
  onMessage(@TcpBuffer() frame: Uint8Array): void {
    console.log(Buffer.from(frame).toString('utf8'));
  }
}

const server = createServer(ChatServer);
const address = await server.ready;
const client = connect(ChatClient, { port: address.port });
const socket = await client.ready;
console.log(socket.id);
await client.close();
await server.close();
```

`createServer` and `connect` take an optional `{ host, port }`. Each field that you pass replaces the decorator value for that call. The class metadata is unchanged, so another call can use a different override.

```ts
const server = createServer(ChatServer, { host: '127.0.0.1', port: 0 });
const address = await server.ready;
const client = connect(ChatClient, { host: address.host, port: address.port });
await client.ready;
```

`server.ready` resolves to `{ host, port }` after the listen socket is bound. `client.ready` resolves to the `TcpSocket` after the TCP connection, or after the TLS handshake when the class uses `@TcpSecure`. Both handles expose `close()`, which returns a `Promise<void>`. Calling `close()` again returns the same promise.

If the listen or connect fails, `ready` rejects. `close()` still resolves. A constructor that throws fails inside `createServer` or `connect` before a handle is returned. A class without `@TcpController(host, port)` throws `Class requires @TcpController(host, port).`

`@TcpListening` runs only for `createServer`, on the singleton created for that call, after the port is bound. `connect` does not run listening handlers.

## Framing

TCP does not preserve message boundaries. One `send` may arrive as several `data` chunks, and several writes may arrive as one chunk.

`@TcpMessageStream()` turns on length-prefix framing:

- Each payload is prefixed with its length as a 4-byte big-endian `uint32`.
- Incoming bytes stay buffered until a full header and body are present.
- `maxFrameBytes` defaults to `DEFAULT_MAX_FRAME_BYTES` (`1_048_576`, 1 MiB).
- Pass `{ maxFrameBytes }` to use another positive integer. `0`, negatives, and non-integers throw `Invalid frame limit: …` when the decorator runs.

Both peers need the same framing. A length-prefix `send` is one message for a peer that also uses `@TcpMessageStream`.

Omit `@TcpMessageStream` for raw mode. Every `data` chunk is delivered as one frame, and `send` writes those bytes with no length header. Use raw mode only when the application already knows how to split the byte stream. A chunk is not a logical message.

On one connection, frames are delivered in order. The next frame waits until the message handlers for the current frame have finished. Handlers may be `async`. Other connections run independently.

## TLS

`@TcpSecure` selects `node:tls` instead of plain TCP. The options are `cert`, `key`, `ca`, `passphrase`, `requestCert`, `rejectUnauthorized`, `servername`, and `alpnProtocols`. `cert`, `key`, and `ca` are a `string` or a `Buffer`. `ca` may also be a list.

The server must have `cert` and `key`. That check runs when the server opens. A missing value rejects `ready` with `TLS server requires cert and key in @TcpSecure.`

On the client, `ca` is the trust anchor, `servername` is the SNI name (the endpoint host when omitted), and `rejectUnauthorized` is passed through when you set it. When you omit it, Node's default applies and unauthorized certificates are rejected.

`@TcpClientConnected` runs only after the handshake: `secureConnection` on the server and `secureConnect` on the client. `socket.encrypted` and `socket.authorized` reflect that TLS socket. A plain TCP socket reports both as `false`.

```ts
@TcpController('0.0.0.0', 4433)
@TcpSecure({ cert, key, requestCert: false })
@TcpMessageStream()
class SecureServer {
  @TcpClientConnected()
  onConnect(@TcpSocket() socket: TcpSocket): void {
    console.log(socket.encrypted, socket.authorized);
  }
}

@TcpController('127.0.0.1', 4433)
@TcpSecure({ ca, servername: 'localhost', rejectUnauthorized: true })
@TcpMessageStream()
class SecureClient {
  @TcpClientConnected()
  onConnect(@TcpSocket() socket: TcpSocket): void {
    socket.send(Buffer.from('ping'));
  }
}
```

`cert` and `key` above are `string | Buffer` values already loaded by the application. `ca` is the certificate the client uses to verify the server.

## Parameters

Parameter decorators inject the value for that call. An argument without a decorator is `undefined`. The context object is frozen.

| Decorator         | Value                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@TcpBuffer()`    | Raw `Uint8Array` frame (`FrameView.bytes`, not a copy). Set for `@TcpMessage`.                                         |
| `@TcpFrame()`     | `FrameView` for this frame, the same object the criteria received. Set for `@TcpMessage`.                              |
| `@TcpSocket()`    | Socket facade for this connection. Absent for `@TcpListening` and for failures that happen before a connection exists. |
| `@TcpContext()`   | Frozen `TcpContext` for this call.                                                                                     |
| `@TcpHadError()`  | Boolean from the socket `close` event. Set for `@TcpClientDisconnected`.                                               |
| `@TcpException()` | `Error` for this failure. Set for `@TcpError`.                                                                         |

`TcpContext` fields:

| Field          | Meaning                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `socket`       | Connection socket, when this call has one.                                |
| `host`, `port` | Bound address in `@TcpListening`. Local address and port on a connection. |
| `hadError`     | Close flag in `@TcpClientDisconnected`.                                   |
| `error`        | Failure in `@TcpError`.                                                   |
| `source`       | `"transport"`, `"framing"`, or `"handler"` in `@TcpError`.                |
| `method`       | Handler name when `source` is `"handler"`.                                |

```ts
@TcpClientDisconnected()
onDisconnect(
  @TcpSocket() socket: TcpSocket,
  @TcpHadError() hadError: boolean,
  @TcpContext() context: TcpContext,
): void {
  console.log(socket.id, hadError, context.hadError);
}

@TcpError()
onError(@TcpException() error: Error, @TcpContext() context: TcpContext): void {
  console.error(context.source, context.method, error.message);
}
```

A thrown value is normalized before it reaches `@TcpError`. An `Error` is kept. A string becomes `new Error(string)`. Anything else becomes `Error` with the message `Unknown failure.`

## Routing

Each arriving frame is wrapped in one `FrameView`. Every criterion for that frame, and every `@TcpFrame()` parameter, receives that same view. The runtime builds it once per frame. The view points at the frame `Uint8Array` and does not copy it. Numeric reads use a `DataView` over that array's `buffer`, `byteOffset`, and `byteLength`.

| Member                                                  | Behavior                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `bytes`, `byteLength`                                   | The frame bytes and their length.                                                             |
| `uint8(offset)`, `uint16be(offset)`, `uint32be(offset)` | Big-endian read. An offset that does not fit throws `RangeError` (`… is outside the frame.`). |
| `ascii()`                                               | Latin-1 decode of the frame bytes. The string is cached on that view after the first call.    |

`ascii()` does not decode UTF-8, and nothing on the hot path does. Decode `bytes` yourself when you need another encoding. `createFrameView(bytes)` builds a view over an existing `Uint8Array` without copying; handlers normally receive the view from the runtime.

`Criterion` is `(frame: FrameView) => boolean`. `FramePredicate` is the same type. `@TcpCriteria(predicate)` adds one criterion to a method. Every criterion on that method must pass (AND). A method with no criterion accepts every frame that is routed to it. Stacking `@TcpCriteria` is not OR. Use `anyOf` for that.

These helpers compare bytes. The needle is copied once, when the criterion is created. A field that does not fit in the frame is a miss: the `*At`, `prefix`, and `bytesEqual` helpers return `false` and do not throw. An empty needle is not a match (`bytesIncludes` and `prefix`). `bytesEqual([])` matches only an empty frame.

- `bytesEqual(expected)` is true when the frame bytes are exactly `expected`.
- `prefix(expected)` is true when the frame starts with `expected`.
- `bytesIncludes(expected)` is true when `expected` occurs in the frame (`Buffer#indexOf` on the bytes).
- `uint8At(offset, value)`, `uint16beAt(offset, value)`, and `uint32beAt(offset, value)` read one big-endian field.
- `minLength(n)` is true when `byteLength >= n`.
- `allOf(...criteria)` is true when every criterion passes. An empty list is true.
- `anyOf(...criteria)` is true when one criterion passes. An empty list is false.
- `not(criterion)` inverts one criterion.

```ts
import { allOf, prefix, TcpCriteria, TcpMessage, uint8At } from "tcp-controller";

@TcpCriteria(allOf(prefix([0x01]), uint8At(1, 0x10)))
@TcpMessage()
onHeader(): void {}
```

### Discriminant

`@TcpWhen` selects one `@TcpMessage` method from fields in the frame. Each field is `{ offset, width, value }`. `width` is `1`, `2`, or `4` (`uint8`, `uint16be`, or `uint32be`) at `offset`. `value` is the unsigned integer that field must equal. Several fields on the same `@TcpWhen` are an AND: every field must fit in the frame and equal its `value`.

`@TcpWhen` also accepts `Criterion` functions mixed with those fields, in any position. Each function is an extra AND, together with every `@TcpCriteria` on that method. A `@TcpWhen` that lists only criteria, and no fields, is valid. `@TcpWhen()` with no arguments is not.

`@TcpMessage` is required on the method that handles the frame. There is no class-level field map. Each method declares its own offsets.

Handlers that use `@TcpWhen` are tested in declaration order. The first handler whose fields all fit, whose values all match, and whose criteria all pass runs alone. No other `@TcpMessage` method runs for that frame. That complete match is the only exclusive case.

A field that does not fit (`offset + width` past the end of the frame) does not match that handler. A value that differs does the same. The next `@TcpWhen` is tried.

A criterion that returns false does not consume the frame. That `@TcpWhen` did not match, so a later `@TcpWhen` can still match, even when the fields were equal. If no `@TcpWhen` matches, `@TcpMessage` methods without `@TcpWhen` run in declaration order and are filtered by their criteria. That is the fallback. Several fallback methods may run for one frame.

A broader `@TcpWhen` declared before a more specific one consumes frames the later method would also match. Put the specific handler first.

Identical `@TcpWhen` declarations are allowed. The first complete match wins.

```ts
import { TcpController, TcpMessage, TcpWhen, minLength } from 'tcp-controller';

@TcpController('0.0.0.0', 9000)
class Server {
  @TcpWhen({ offset: 0, width: 1, value: 0x01 }, { offset: 2, width: 1, value: 0x10 }, minLength(8))
  @TcpMessage()
  onArm(): void {}

  @TcpWhen({ offset: 0, width: 1, value: 0x01 }, { offset: 2, width: 1, value: 0x20 })
  @TcpMessage()
  onDisarm(): void {}

  @TcpWhen({ offset: 0, width: 1, value: 0x01 })
  @TcpMessage()
  onPing(): void {}

  @TcpMessage()
  onOther(): void {}
}
```

`onArm` runs when byte `0` is `0x01`, byte `2` is `0x10`, and the frame is at least 8 bytes. If those bytes match but `minLength(8)` returns false, `onArm` does not consume the frame. `onDisarm` is still tested; it matches only when byte `2` is `0x20`. `onPing` then runs, because byte `0` is `0x01` and neither earlier handler matched completely. `onOther` runs when no `@TcpWhen` matches, including a frame that is too short for a field. `WhenField` is the type of each `{ offset, width, value }` argument.

Reading the class fails with:

| Situation                              | Error                                                   |
| -------------------------------------- | ------------------------------------------------------- |
| `@TcpWhen()` has no arguments          | `@TcpWhen() on method requires a field or a criterion.` |
| `@TcpWhen` is not on `@TcpMessage`     | `@TcpWhen requires @TcpMessage: …`                      |
| `offset` is negative or not an integer | `Invalid @TcpWhen offset on method: …`                  |
| `width` is not `1`, `2`, or `4`        | `Invalid @TcpWhen width on method: …`                   |
| `value` does not fit that width        | `@TcpWhen value does not fit width W: method=N.`        |

Those checks run when the class is read, not when the decorator is applied. `value` must be an integer from `0` through `0xff`, `0xffff`, or `0xffffffff` for widths `1`, `2`, and `4`.

A handler that throws is reported. On a complete `@TcpWhen` match, no other message method is scheduled. On the fallback path, the next plain `@TcpMessage` still runs. A criterion that throws is reported and stops the chain: no later `@TcpWhen` and no fallback method runs. `source` is `"handler"` and `method` is that handler's name. A custom criterion that calls `uint8` / `uint16be` / `uint32be` past the end throws `RangeError`, which is reported as that handler error. The built-in field helpers, and the `@TcpWhen` field reads, do not throw for a short frame. A field that does not fit is a miss.

`@TcpCriteria`, `@TcpWhen`, or a parameter decorator on a method that has no lifecycle decorator fails when the class is read: `Methods missing a lifecycle decorator: …`.

A subclass method replaces the inherited handler with the same name. Handlers the subclass does not define are kept. Those parent handlers run before the child's handlers. Class decorators such as `@TcpController` are read from the class passed to `createServer` or `connect`, not from a superclass.

## Lifecycle

| Decorator                  | When                                                   |
| -------------------------- | ------------------------------------------------------ |
| `@TcpListening()`          | `createServer` finished bind. Runs on the singleton.   |
| `@TcpClientConnected()`    | Plain TCP is connected, or the TLS handshake finished. |
| `@TcpMessage()`            | A frame was routed to this method.                     |
| `@TcpClientDisconnected()` | The connection closed.                                 |
| `@TcpError()`              | Transport, framing, or handler failure.                |

`context.source` on `@TcpError`:

| Source        | When                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------- |
| `"transport"` | Socket error, a failed `connect`, or an error on the listening server. `method` is unset. |
| `"framing"`   | The codec rejected a chunk. The socket is destroyed. `method` is unset.                   |
| `"handler"`   | A lifecycle method threw, or one of its predicates threw. `method` is that method's name. |

An exception thrown inside `@TcpError` does not enter that handler again. It is written to stderr:

```text
tcp-controller: @TcpError <method> failed: <message>
```

If the same failure is reported again while that `@TcpError` call is still running, the library skips the handler and writes:

```text
tcp-controller: reentrant error in <key>: <message>
```

## Scope

The default scope is `"singleton"`: one instance per `createServer` or `connect`. Keep per-connection data on `socket.id` or in your own map.

`@TcpScope("connection")` constructs a new instance for each connection. Connected, message, disconnected, and connection error handlers use that instance. `@TcpListening` stays on the singleton, because the server has no connection yet when it starts listening.

```ts
import { TcpController, TcpListening, TcpMessage, TcpScope, TcpSocket } from 'tcp-controller';

@TcpController('127.0.0.1', 0)
@TcpScope('connection')
class Session {
  private seen = 0;

  @TcpListening()
  onListening(): void {
    // Singleton created by createServer. No connection exists yet.
  }

  @TcpMessage()
  onMessage(@TcpSocket() socket: TcpSocket): void {
    this.seen += 1;
    console.log(socket.id, this.seen);
  }
}
```

`@TcpScope("singleton")` is the same as omitting the decorator.

## Socket

`TcpSocket` is a facade around the live connection.

| Member                        | Behavior                                                                 |
| ----------------------------- | ------------------------------------------------------------------------ |
| `id`                          | UUID for this connection.                                                |
| `remoteAddress`, `remotePort` | Peer address, when the socket has one.                                   |
| `localAddress`, `localPort`   | Local address, when the socket has one.                                  |
| `encrypted`, `authorized`     | TLS state. Both are `false` on plain TCP.                                |
| `send(payload)`               | Encodes `payload` with the controller codec and writes it.               |
| `end()`                       | Ends the writable side (`duplex.end()`). It does not destroy the socket. |

In length-prefix mode, `send` throws `FramingError` when the payload is larger than `maxFrameBytes` or larger than a `uint32`. In raw mode, `send` writes a copy of the payload and does not apply that limit.

`handle.close()` shuts down what is still open. On a server it destroys open sockets and closes the listener. On a client it destroys the socket.

## Frame limit and `FramingError`

`FramingError` extends `Error` and sets `name` to `"FramingError"`. Length-prefix mode throws it in three cases:

| Message                                      | When                                                          |
| -------------------------------------------- | ------------------------------------------------------------- |
| `Payload of N bytes exceeds the limit of M.` | `send` payload is larger than `maxFrameBytes`.                |
| `Frame of N bytes exceeds the limit of M.`   | An incoming length header declares more than `maxFrameBytes`. |
| `Payload exceeds uint32 size.`               | `send` payload does not fit in a `uint32`.                    |

An incoming frame over the limit is reported to `@TcpError` with `source` `"framing"`, the socket is destroyed, and later chunks on that connection are ignored. A `send` that throws does so at the call site. If that call is inside a handler, the exception is a handler error.

```ts
import { FramingError, TcpContext, TcpError, TcpException } from "tcp-controller";

@TcpError()
onError(@TcpContext() context: TcpContext, @TcpException() error: Error): void {
  if (context.source === "framing" && error instanceof FramingError) {
    console.error(error.message);
  }
}
```
