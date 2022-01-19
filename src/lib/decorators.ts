import { 
  EasyClassDecorator, 
  EasyMethodDecorator,
  EasyParameterDecorator,
  EasyPropertyDecorator
} from "@muryllo/easy-decorators";

export const TcpController          = (address: string, port: number) => EasyClassDecorator("class:tcpcontroller", { address, port });
export const TcpMessageStream       = () => EasyClassDecorator("class:tcpmessagestream", {});
export const TcpMessage             = () => EasyMethodDecorator("method:tcpmessage", {});
export const TcpError               = () => EasyMethodDecorator("method:tcperror", {});
export const TcpListening           = () => EasyMethodDecorator("method:tcplistening", {});
export const TcpClientDisconnected  = () => EasyMethodDecorator("method:tcpclientdisconnected", {});
export const TcpClientConnected     = () => EasyMethodDecorator("method:tcpclientconnected", {});
export const TcpCriteria            = (id: string) => EasyMethodDecorator("method:tcpcriteria", id);
export const TcpCriteriaId          = (id: string) => EasyMethodDecorator("method:tcpcriteriaid", id);
export const TcpBuffer              = () => EasyParameterDecorator("parameter:tcpbuffer", {});
export const TcpSocket              = () => EasyParameterDecorator("parameter:tcpsocket", {});
export const TcpInjectSocket        = () => EasyPropertyDecorator("property:tcpinjectsocket", {});
