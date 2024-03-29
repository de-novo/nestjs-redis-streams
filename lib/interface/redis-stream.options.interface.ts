import {
  RedisConnectionOptions,
  RedisStreamOptions,
} from './redis-stream.interface';
import {
  ConsumerSerialization,
  ProducerSerialization,
} from './redis-stream.serializtaion.interface';

export interface ClientConstructorOptions {
  streams: RedisStreamOptions;
  connection?: RedisConnectionOptions;
  serialization?: ProducerSerialization;
  responsePattern?: string[];
}

export interface ServerConstructorOptions {
  streams: RedisStreamOptions;
  connection?: RedisConnectionOptions;
  serialization?: ConsumerSerialization;
}
