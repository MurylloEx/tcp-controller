import { NativeSocket, TcpGateway } from "./lib/base";
import { clientConnect, createServer } from "./lib/methods";
import {
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
} from "./lib/decorators";

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

@TcpController("localhost", 1337)
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

createServer(TcpServer);
clientConnect(TcpClient);