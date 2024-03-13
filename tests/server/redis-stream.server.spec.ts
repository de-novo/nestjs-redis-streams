import { RedisStreamServer } from '../../lib';
import { RedisConnectionOptions } from '../../lib/interface/redis-stream.interface';
import { ServerConstructorOptions } from '../../lib/interface/redis-stream.options.interface';

jest.mock('../../lib/util/redisConnection', () => ({
  createRedisConnection: jest.fn().mockReturnValue({
    on: jest.fn(),
    once: jest.fn(),
    quit: jest.fn(),
    xreadgroup: jest.fn().mockResolvedValue([]),
    xadd: jest.fn().mockResolvedValue(''),
    xread: jest.fn().mockResolvedValue([]),
    xgroup: jest.fn().mockResolvedValue(''),
    connect: jest.fn().mockResolvedValue(''),
  }),
}));

describe('Redis Stream Server', () => {
  let server: RedisStreamServer;
  let options: ServerConstructorOptions;

  beforeEach(() => {
    options = {
      connection: {} as RedisConnectionOptions,
      streams: {
        consumerGroup: 'testGroup',
        consumer: 'testConsumer',
        block: 0,
      },
      serialization: {
        serializer: { serialize: jest.fn() },
        deserializer: { deserialize: jest.fn() },
      },
    };
    server = new RedisStreamServer(options);
  });

  describe('listen', () => {
    let bindHandlersMock: jest.Mock;
    beforeEach(() => {
      bindHandlersMock = jest.fn();
      server['bindHandlers'] = bindHandlersMock;
    });
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('should initialize the redis server', async () => {
      await server.listen(() => {});
      expect(server['redis']).toBeDefined();
    });
    it('should initialize the redis client', async () => {
      await server.listen(() => {});
      expect(server['client']).toBeDefined();
    });
    it('should bind the handlers', async () => {
      await server.listen(() => {});
      expect(bindHandlersMock).toHaveBeenCalled();
    });
  });
});
