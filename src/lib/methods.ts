import { getEasyMetadataEntries } from "@muryllo/easy-decorators";
import { createServer as createTcpServer, Socket } from "net";
import { decode } from "frame-stream";
import { TcpGateway } from "./base";
import { exec } from "./execute";

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

  let stream = messageStream.length == 0 ? sock : sock.pipe(decode());

  sock.on("close", (hadError: boolean) => {
    //Call disconnected methods
    disconnected.map(e => {
      if (e.key){
        instance[e.key](hadError);
      }
    });
  }).on("error", (err: Error) => {
    //Call error methods
    error.map(e => {
      if (e.key){
        instance[e.key](err);
      }
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
          let buffers = buffer.filter(b => b.key == criteriaRef?.key).map(b => {
            b.value = data;
            return b;
          });
          let sockets = socket.filter(s => s.key == criteriaRef?.key).map(s => {
            s.value = sock;
            return s;
          });

          let args = buffers.concat(sockets);
          
          status = !!criteriaRef.key && !!exec(instance, instance[criteriaRef.key], args);
        }
      });

      if (status && e.key){
        let buffers = buffer.filter(b => b.key == e.key).map(b => {
          b.value = data;
          return b;
        });
        let sockets = socket.filter(s => s.key == e.key).map(s => {
          s.value = sock;
          return s;
        });

        let args = buffers.concat(sockets);

        exec(instance, instance[e.key], args);
      }
    });
  });

  return sock;
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
        let args = sockets.map(s => {
          s.value = sock;
          return s;
        });
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
    //Call connected methods
    connected.map(e => {
      if (e.key){
        let sockets = socket.filter(s => s.key == e.key);
        let args = sockets.map(s => {
          s.value = handleTcpEvents(instance, sock);
          return s;
        });
        exec(instance, instance[e.key], args);
      }
    });
  }).on("close", () => {
    //Call disconnected methods
    disconnected.map(e => {
      if (e.key){
        instance[e.key]();
      }
    });
  }).on("listening", () => {
    //Call listening methods
    listening.map(e => {
      if (e.key){
        instance[e.key]();
      }
    });
  }).on("error", (err: Error) => {
    //Call error methods
    error.map(e => {
      if (e.key){
        instance[e.key](err);
      }
    });
  }).listen(port, address);
}
