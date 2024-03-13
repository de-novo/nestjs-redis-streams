import * as Redis from 'ioredis';

export type RedisInstance = Redis.Redis;
export type RedisConnectionOptions = { options?: Redis.RedisOptions } & {
  path: string;
};

export interface RedisStreamXreadGroupOptions {
  block?: number;
  consumerGroup: string;
  consumer: string;
  deleteMessagesAfterAck?: boolean;
}
export type RedisStreamOptions = RedisStreamXreadGroupOptions;

export type RawStreamMessage = [id: string, payload: string[]];

export type MessageInput = {
  value: any;
  headers: Record<string, any>;
};

export interface StreamResponseObject {
  payload: MessageInput;
  stream: string;
}

export type StreamResponse =
  | StreamResponseObject[]
  | StreamResponseObject
  | boolean
  | undefined
  | null;
