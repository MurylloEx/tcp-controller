import { getEasyMetadataEntries } from "@muryllo/easy-decorators";
import { encode, Encoder } from "frame-stream";
import { Socket } from "net";

export * from "frame-stream";

export interface ITcpGateway {
  [key: PropertyKey]: any;
}

export abstract class TcpGateway implements ITcpGateway {

  [key: PropertyKey]: any;

  send(socket: Socket, data: Buffer): Socket | Encoder {
    let messageStream = getEasyMetadataEntries(this, "class:tcpmessagestream");
    if (messageStream.length == 0){
      socket.write(data);
      return socket;
    }

    const encoder = encode();
    encoder.pipe(socket);
    encoder.write(data);
    return encoder;
  }

}