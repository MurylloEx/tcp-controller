<h1 align="center">TCP Controller</h1>
<p align="center">The TCP Controller is a framework to create your own TCP client/server using stream and message stream based support to send and receive data.</p>

<p align="center">
  <img src="https://badgen.net/npm/v/tcp-controller"/>
  <img src="https://badgen.net/npm/dt/tcp-controller"/>
  <img src="https://badgen.net/npm/license/tcp-controller"/>
  <img src="https://badgen.net/npm/types/tcp-controller"/>
  <img src="https://badgen.net/badge/author/MurylloEx/red?icon=label"/>
</p>

## Getting started into TCP Controller!

<p align="justify">
To use this library you need to create a class that will be the TCP controller and then annotate it with @TcpController([address, port]). The entire architecture was based on the REST API standard and ported to the transport layer of the TCP/IP model.

  1. ```@TcpController([address, port])``` 
  2. ```@TcpMessageStream()```
  3. ```@TcpMessage()```
  4. ```@TcpError()```
  5. ```@TcpListening()```
  6. ```@TcpClientDisconnected()```
  7. ```@TcpClientConnected()```
  8. ```@TcpCriteria([id])```
  9. ```@TcpCriteriaId([id])```
  10. ```@TcpBuffer()```
  11. ```@TcpSocket()```
  12. ```@TcpInjectSocket()```

</p>

## Installation

<p align="center">
  <img src="https://nodei.co/npm/tcp-controller.png?downloads=true&downloadRank=true&stars=true" alt="Installation"/>
</p>

<p align="justify">You must run the following terminal command.<p>

```
npm install tcp-controller --save
```

## How to use?

The first thing to do to create your gateway and interact with a server that supports flow-oriented TCP/IP or message flow is to create a class and annotate it with ```@TcpController```, then add at least one method of message processing annotated by ``` @TcpMessage```. After creating the class, you need to call ```createServer``` to start the lifecycle of your gateway if it is a server or ```clientConnect``` if the gateway is a TCP/IP client.

In TCP Controller, the life cycle of a TCP connection is regulated by 3 decorators, they are: ```@TcpClientConnected```, ```@TcpClientDisconnected```, ```@TcpError```. Whenever the connection is successfully established, the method decorated with ```@TcpClientConnected``` is invoked, just as when the connection is closed the method decorated with ```@TcpClientDisconnected``` is invoked. In TCP Controller there are 2 types of exceptions, those caused by network failures and those caused by application code failures. The method decorated with ```@TcpError``` catches TCP connection errors. There is currently no equivalent for exceptions caused by application crashes.

To send a reply for each incoming message you can use the ```send``` function which is declared in the TcpGateway class. Create your Tcp Controller class and inherit from the TcpGateway class. You can call the ```send``` function more than once in an incoming message.

For a more detailed overview see the example of integration below using a Gateway to receive messages. Here is a TCP server sample:
```ts
import { Socket } from "net";
import {
  createServer,
  NativeSocket,
  TcpGateway,
  TcpBuffer,
  TcpClientConnected,
  TcpClientDisconnected,
  TcpController,
  TcpCriteria,
  TcpCriteriaId,
  TcpError,
  TcpListening,
  TcpMessage,
  TcpMessageStream,
  TcpSocket
} from "tcp-controller";

@TcpController("0.0.0.0", 1337)
@TcpMessageStream()
class TcpServer extends TcpGateway {

  @TcpClientConnected()
  onConnect(@TcpSocket() sock: NativeSocket) {
    console.log("[Server] Connected client from " + sock.remoteAddress);
    this.send(sock, Buffer.from("Server to client!"));
    this.send(sock, Buffer.from("5erver to client!"));
  }

  @TcpClientDisconnected()
  onDisconnect(hadError: boolean) {
    console.log("[Server] Disconnected client with error? " + hadError);
  }

  @TcpError()
  onError(error: Error) {
    console.log("[Server] Error happened: " + error.message);
  }

  @TcpListening()
  onListening() {
    console.log("[Server] Server up.");
  }

  @TcpCriteria("message")
  @TcpMessage()
  onMessage(@TcpBuffer() buffer: Buffer, @TcpSocket() sock: NativeSocket) {
    console.log("[Server] Message received from " + sock.remoteAddress + ".\nMessage: " + buffer.toString());
  }

  @TcpCriteriaId("message")
  isMessage(@TcpBuffer() buffer: Buffer) {
    return buffer.toString().includes("Client to server!");
  }

}

createServer(TcpServer);
```

And here is a Client TCP Gateway:

```ts
import { Socket } from "net";
import {
  clientConnect,
  NativeSocket,
  TcpGateway,
  TcpBuffer,
  TcpClientConnected,
  TcpClientDisconnected,
  TcpController,
  TcpCriteria,
  TcpCriteriaId,
  TcpError,
  TcpMessage,
  TcpMessageStream,
  TcpSocket
} from "tcp-controller";

@TcpController("0.0.0.0", 1337)
@TcpMessageStream()
class TcpClient extends TcpGateway {

  @TcpClientConnected()
  onConnect(@TcpSocket() sock: NativeSocket) {
    console.log("[Client] Connected to server " + sock.remoteAddress);
    this.send(sock, Buffer.from("Client to server!"));
    this.send(sock, Buffer.from("Client to 5erver!"));
  }

  @TcpClientDisconnected()
  onDisconnect(hadError: boolean) {
    console.log("[Client] Disconnected with error? " + hadError);
  }

  @TcpError()
  onError(error: Error) {
    console.log("[Client] Error happened: " + error.message);
  }

  @TcpCriteria("message")
  @TcpMessage()
  onMessage(@TcpBuffer() buffer: Buffer, @TcpSocket() sock: NativeSocket) {
    console.log("[Client] Message received from " + sock.remoteAddress + ".\nMessage: " + buffer.toString());
  }

  @TcpCriteriaId("message")
  isMessage(@TcpBuffer() buffer: Buffer) {
    return buffer.toString().includes("Server to client!");
  }

}

clientConnect(TcpClient);
```

## Metadata

Muryllo Pimenta de Oliveira – muryllo.pimenta@upe.br

Distributed under MIT license. See ``LICENSE`` for more informations.

## Contributing

1. Create a fork (<https://github.com/MurylloEx/tcp-controller/fork>)
2. Create a feature branch (`git checkout -b feature/fooBar`)
3. Commit your changes (`git commit -am 'Add some fooBar'`)
4. Send a push of your commit (`git push origin feature/fooBar`)
5. Open a new Pull Request