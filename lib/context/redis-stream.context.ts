import { BaseRpcContext } from '@nestjs/microservices';

export type RedisStreamContextArgs = [
  string | undefined, // stream
  string | undefined, // message_id
  string | undefined, // group
  string | undefined, // consumer
];
export class RedisStreamContext extends BaseRpcContext<RedisStreamContextArgs> {
  private headers: Record<string, any> = {};

  /**
   *[stream, message_id, group, consumer]
   */
  constructor(
    args: RedisStreamContextArgs = [undefined, undefined, undefined, undefined],
  ) {
    super(args);
  }

  getStream() {
    return this.args[0];
  }
  setStream(stream: string) {
    this.args[0] = stream;
    return this;
  }

  getMessageId() {
    return this.args[1];
  }
  setMessageId(messageId: string) {
    this.args[1] = messageId;
    return this;
  }

  getConsumerGroup() {
    return this.args[2];
  }
  setConsumerGroup(group: string) {
    this.args[2] = group;
    return this;
  }

  getConsumer() {
    return this.args[3];
  }
  setConsumer(consumer: string) {
    this.args[3] = consumer;
    return this;
  }

  getMessageHeaders() {
    return this.headers;
  }

  setMessageHeaders(headers: any) {
    this.headers = headers;
    return this;
  }
  addMessageHeader(key: string, value: any) {
    this.headers[key] = value;
    return this;
  }

  get(): RedisStreamContextArgs {
    return this.args;
  }
}
