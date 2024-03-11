import Redis, { RedisOptions } from 'ioredis';

export function createRedisConnection(
  options?: { options?: RedisOptions } & { path: string },
) {
  if (!options) {
    return new Redis();
  }
  if (!options.options) {
    return new Redis(options.path);
  }
  return new Redis(options.path, options.options);
}
