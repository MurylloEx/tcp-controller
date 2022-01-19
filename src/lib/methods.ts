import { exec } from "./execute";
import { decode } from "frame-stream";
import { TcpGateway, NativeSocket } from "./base";
import { createServer as createTcpServer, Socket } from "net";
import { EasyMetadataEntry, getEasyMetadataEntries } from "@muryllo/easy-decorators";

function swapEntryValues<T = any>(entries: EasyMetadataEntry<T>[], newValue: T){
  return entries.map((e => {
    e.value = newValue;
    return e;
  }));
}

function handleTcpEvents(instance: any, sock: Socket){
  let messageStream = getEasyMetadataEntries(instance, "class:tcpmessagestream");
  let message       = getEasyMetadataEntries(instance, "method:tcpmessage");
  let error         = getEasyMetadataEntries(instance, "method:tcperror");
  let disconnected  = getEasyMetadataEntries(instance, "method:tcpclientdisconnected");
  let criteria      = getEasyMetadataEntries(instance, "method:tcpcriteria");
  let criteriaId    = getEasyMetadataEntries(instance, "method:tcpcriteriaid");
  let buffer        = getEasyMetadataEntries(instance, "parameter:tcpbuffer");
  let socket        = getEasyMetadataEntries(instance, "parameter:tcpsocket");
  let clients       = getEasyMetadataEntries(instance, "property:tcpinjectsocket");

  clients?.map(v => {
    if (v.key) instance[v.key] = sock;
  });

  let isMessageStream = messageStream.length == 0;
  let nativeSocket = Object.assign<NativeSocket, Socket>(new NativeSocket(), sock);
  let stream = isMessageStream ? nativeSocket : nativeSocket.pipe(decode());

  sock.on("close", (hadError: boolean) => {
    //Call disconnected methods
    disconnected.map(e => {
      if (e.key) instance[e.key](hadError);
    });
  }).on("error", (err: Error) => {
    //Call error methods
    stream.end();
    error.map(e => {
      if (e.key) instance[e.key](err);
    });
  });

  stream.on("data", (data: Buffer) => {
    //Call message methods
    message.map(e => {
      let criterias = criteria.filter(c => c.key == e.key);
      let status = true;

      criterias.map(criteria => {
        let criteriaRef = criteriaId.find(c => c.value == criteria.value);

        if (criteriaRef != undefined){
          let buffers = swapEntryValues(buffer.filter(b => b.key == criteriaRef?.key), data);
          let sockets = swapEntryValues(socket.filter(s => s.key == criteriaRef?.key), nativeSocket);

          let args = buffers.concat(sockets);
          
          status = !!criteriaRef.key && !!exec(instance, instance[criteriaRef.key], args);
        }
      });

      if (status && e.key){
        let buffers = swapEntryValues(buffer.filter(b => b.key == e.key), data);
        let sockets = swapEntryValues(socket.filter(s => s.key == e.key), nativeSocket);

        let args = buffers.concat(sockets);

        exec(instance, instance[e.key], args);
      }
    });
  });

  return nativeSocket;
}

export function clientConnect(gatewayClass: new () => TcpGateway){
  let instance = new gatewayClass();

  let [controller]  = getEasyMetadataEntries(instance, "class:tcpcontroller");
  let socket        = getEasyMetadataEntries(instance, "parameter:tcpsocket");
  let connected     = getEasyMetadataEntries(instance, "method:tcpclientconnected");

  if (!controller)
    throw new Error("Invalid Gateway provided. The class must be decorated with @TcpController");
  
  const { address, port } = controller.value;

  let sock = handleTcpEvents(instance, new Socket());

  sock.setKeepAlive(true, 3000);
  sock.connect(port, address, () => {
    //Call connected methods
    connected.map(e => {
      if (e.key){
        let sockets = socket.filter(s => s.key == e.key);
        let args = swapEntryValues(sockets, sock);

        exec(instance, instance[e.key], args);
      }
    });
  });
}

export function createServer(gatewayClass: new () => TcpGateway){
  let instance = new gatewayClass();

  let [controller]  = getEasyMetadataEntries(instance, "class:tcpcontroller");
  let error         = getEasyMetadataEntries(instance, "method:tcperror");
  let listening     = getEasyMetadataEntries(instance, "method:tcplistening");
  let disconnected  = getEasyMetadataEntries(instance, "method:tcpclientdisconnected");
  let connected     = getEasyMetadataEntries(instance, "method:tcpclientconnected");
  let socket        = getEasyMetadataEntries(instance, "parameter:tcpsocket");

  const server = createTcpServer();

  if (!controller)
    throw new Error("Invalid Gateway provided. The class must be decorated with @TcpController");
  
  const { address, port } = controller.value;
  
  server.on("connection", (sock: Socket) => {
    let nativeSock = handleTcpEvents(instance, sock);

    //Call connected methods
    connected.map(e => {
      if (e.key){
        let sockets = socket.filter(s => s.key == e.key);
        let args = swapEntryValues(sockets, nativeSock);

        exec(instance, instance[e.key], args);
      }
    });
  }).on("listening", () => {
    //Call listening methods
    listening.map(e => {
      if (e.key) instance[e.key]();
    });
  }).on("close", () => {
    //Call disconnected methods
    disconnected.map(e => {
      if (e.key) instance[e.key]();
    });
  }).on("error", (err: Error) => {
    //Call error methods
    error.map(e => {
      if (e.key) instance[e.key](err);
    });
  }).listen(port, address);

}
