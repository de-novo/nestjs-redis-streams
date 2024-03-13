import { createRedisConnection } from '../../lib/util/redisConnection';

jest.mock('ioredis', () => {
  // 모킹된 Redis 클래스
  const RedisMock = jest.fn().mockImplementation((path, option) => ({
    options: { ...option, path },
  }));
  return { default: RedisMock };
});

describe('createRedisConnection', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create a Redis instance without any options', () => {
    const connection = createRedisConnection();
    expect(connection).toBeDefined();
  });

  it('should create a Redis instance with a path', () => {
    const testPath = 'my-redis-path';
    const connection = createRedisConnection({ path: testPath });
    expect(connection.options.path).toBe(testPath);
  });
});
