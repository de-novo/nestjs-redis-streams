import { RedisConnectionOptions, RedisStreamOptions } from './redis.interface';
import {
  ConsumerSerialization,
  ProducerSerialization,
} from './serializtaion.interface';

export interface ClientConstructorOptions {
  streams: RedisStreamOptions;
  connection?: RedisConnectionOptions;
  serialization?: ProducerSerialization;
  responesePattern?: string[];
}

export interface ServerConstructorOptions {
  streams: RedisStreamOptions;
  connection?: RedisConnectionOptions;
  serialization?: ConsumerSerialization;
}
