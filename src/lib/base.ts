import { getEasyMetadataEntries } from "@muryllo/easy-decorators";
import { Socket, SocketConstructorOpts } from "net";
import { encode, Encoder } from "frame-stream";
import { v4 } from "uuid";

export * from "frame-stream";

export interface ITcpGateway {
  [key: PropertyKey]: any;
}

export abstract class TcpGateway implements ITcpGateway {

  [key: PropertyKey]: any;

  send(socket: NativeSocket, data: Buffer): NativeSocket | Encoder {
    let messageStream = getEasyMetadataEntries(this, "class:tcpmessagestream");
    if (messageStream.length == 0){
      socket.write(data);
      return socket;
    }
    let encoder = socket.getEncoder();
    encoder.write(data);
    return encoder;
  }

}

export class NativeSocket extends Socket {

  private guid: string = v4();
  private encoder: Encoder;

  constructor(options?: SocketConstructorOpts | undefined){
    super(options);
    let encoder = encode();
    this.guid = v4();
    this.encoder = encoder;
    this.encoder.pipe(this);
  }

  getEncoder(){
    if (!!this.encoder){
      return this.encoder;
    } else {
      this.encoder = encode();
      this.encoder.pipe(this);
      return this.encoder;
    }
  }

  get id(){
    return this.guid;
  }

}
