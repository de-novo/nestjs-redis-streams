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

  describe('initializeRedis', () => {
    it('should return Redis Instance', async () => {
      const redis = await server['initializeRedis'](options);
      expect(redis).toBeDefined();
    });
  });

  describe('bindHandlers', () => {
    let messageHandlersMock: Map<string, jest.Mock>;
    let registerStreamMock: jest.Mock;
    let listenOnStreamsMock: jest.Mock;

    beforeEach(() => {
      messageHandlersMock = new Map();
      registerStreamMock = jest.fn();
      listenOnStreamsMock = jest.fn();

      server['listenOnStreams'] = listenOnStreamsMock;
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should register the stream', async () => {
      messageHandlersMock.set('test', jest.fn());

      server['registerStream'] = registerStreamMock;
      (server as any)['messageHandlers'] = messageHandlersMock;

      await server['bindHandlers']();
      expect(registerStreamMock).toHaveBeenCalledTimes(1);
    });

    it('should be able to register multiple streams', async () => {
      messageHandlersMock.set('test', jest.fn());
      messageHandlersMock.set('test2', jest.fn());

      server['registerStream'] = registerStreamMock;
      (server as any)['messageHandlers'] = messageHandlersMock;

      await server['bindHandlers']();
      expect(registerStreamMock).toHaveBeenCalledTimes(2);
    });

    it('should listen on the streams', async () => {
      messageHandlersMock.set('test', jest.fn());

      (server as any)['messageHandlers'] = messageHandlersMock;

      await server['bindHandlers']();
      expect(listenOnStreamsMock).toHaveBeenCalledTimes(1);
    });

    it('should call createConsumerGroup with the correct arguments', async () => {
      messageHandlersMock.set('createConsumerGroup', jest.fn());
      const createConsumerGroupMock = jest.fn();

      server['createConsumerGroup'] = createConsumerGroupMock;
      (server as any)['messageHandlers'] = messageHandlersMock;

      await server['bindHandlers']();
      expect(createConsumerGroupMock).toHaveBeenCalledWith(
        'createConsumerGroup',
        'testGroup',
      );
    });

    it('should throw an error if there is an error', async () => {
      messageHandlersMock.set('test', jest.fn());
      const listenOnStreamsMock = jest.fn();

      server['registerStream'] = jest.fn().mockRejectedValue(new Error('test'));
      server['listenOnStreams'] = listenOnStreamsMock;
      (server as any)['messageHandlers'] = messageHandlersMock;

      await expect(server['bindHandlers']()).rejects.toThrow('test');
    });
  });

  describe('registerStream', () => {
    let createConsumerGroupMock: jest.Mock;
    let streamHandlerMap: Map<string, jest.Mock>;
    beforeEach(() => {
      createConsumerGroupMock = jest.fn();
      server['createConsumerGroup'] = createConsumerGroupMock;

      streamHandlerMap = new Map();
      streamHandlerMap.set('test', jest.fn());
      (server as any)['streamHandlerMap'] = streamHandlerMap;
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should call createConsumerGroup with the correct arguments', async () => {
      await server['registerStream']('test');
      expect(streamHandlerMap.get('test')).toBeDefined();
      expect(createConsumerGroupMock).toHaveBeenCalledWith('test', 'testGroup');
    });

    it('if error, should return false', async () => {
      createConsumerGroupMock.mockRejectedValue(new Error('test'));
      const result = await server['registerStream']('test');
      expect(result).toBeFalsy();
    });
  });
});
