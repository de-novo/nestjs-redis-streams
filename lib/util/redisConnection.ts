import Redis from 'ioredis';
import { RedisConnectionOptions } from '../interface/redis-stream.interface';

export function createRedisConnection(options?: RedisConnectionOptions) {
  if (!options) {
    return new Redis();
  }
  if (!options.options) {
    return new Redis(options.path);
  }
  return new Redis(options.path, options.options);
}
