import { Observable } from 'rxjs';
import { RedisStreamServer } from '../../lib';
import { RedisStreamContext } from '../../lib/context/redis-stream.context';
import {
  RedisConnectionOptions,
  StreamResponse,
} from '../../lib/interface/redis-stream.interface';
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

  describe('createConsumerGroup', () => {
    let xgroupMock: jest.Mock;
    beforeEach(() => {
      xgroupMock = jest.fn();
      server['redis'] = {
        xgroup: xgroupMock,
      } as any;
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should call xgroup with the correct arguments', async () => {
      const result = await server['createConsumerGroup']('test', 'testGroup');
      expect(result).toBeTruthy();
      expect(xgroupMock).toHaveBeenCalledTimes(1);
      expect(xgroupMock).toHaveBeenCalledWith(
        'CREATE',
        'test',
        'testGroup',
        '$',
        'MKSTREAM',
      );
    });

    it("should return true if error message includes 'BUSYGROUP'", async () => {
      xgroupMock.mockRejectedValue({ message: 'BUSYGROUP' });
      server['redis'] = {
        xgroup: xgroupMock,
      } as any;
      const result = await server['createConsumerGroup']('test', 'testGroup');
      expect(result).toBeTruthy();
    });

    it('should return false if there is an error', async () => {
      xgroupMock.mockRejectedValue(new Error('test'));
      server['redis'] = {
        xgroup: xgroupMock,
        disconnect: jest.fn(),
      } as any;
      const result = await server['createConsumerGroup']('test', 'testGroup');
      expect(result).toBeFalsy();
    });
  });

  describe('listenOnStreams', () => {
    let xreadgroupMock: jest.Mock;
    let notifyHandlerMock: jest.Mock;
    let streamHandlerMapMock: Record<string, jest.Mock>;
    beforeEach(() => {
      xreadgroupMock = jest.fn();
      notifyHandlerMock = jest.fn();
      streamHandlerMapMock = {};

      server['streamHandlerMap'] = streamHandlerMapMock;
      server['redis'] = {
        xreadgroup: xreadgroupMock,
      } as any;
      server['notifyHandler'] = notifyHandlerMock;
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('ensures xreadgroup is invoked with proper parameters if streamHandlerMap lacks entries', async () => {
      await server['listenOnStreams'](true);
      expect(xreadgroupMock).toHaveBeenCalledTimes(1);
      expect(xreadgroupMock).toHaveBeenCalledWith(
        'GROUP',
        options.streams.consumerGroup,
        options.streams.consumer,
        'BLOCK',
        options.streams.block,
        'STREAMS',
      );
    });

    it('ensures xreadgroup is invoked with proper parameters if streamHandlerMap has entries', async () => {
      streamHandlerMapMock = {
        test: jest.fn(),
      };

      server['streamHandlerMap'] = streamHandlerMapMock;
      await server['listenOnStreams'](true);

      expect(xreadgroupMock).toHaveBeenCalledTimes(1);
      expect(xreadgroupMock).toHaveBeenCalledWith(
        'GROUP',
        options.streams.consumerGroup,
        options.streams.consumer,
        'BLOCK',
        options.streams.block,
        'STREAMS',
        'test',
        '>',
      );
    });

    it('ensures xreadgroup is invoked with proper parameters if streamHandlerMap has multiple entries', async () => {
      streamHandlerMapMock = {
        test: jest.fn(),
        test2: jest.fn(),
      };

      server['streamHandlerMap'] = streamHandlerMapMock;
      await server['listenOnStreams'](true);

      expect(xreadgroupMock).toHaveBeenCalledTimes(1);
      expect(xreadgroupMock).toHaveBeenCalledWith(
        'GROUP',
        options.streams.consumerGroup,
        options.streams.consumer,
        'BLOCK',
        options.streams.block,
        'STREAMS',
        'test',
        'test2',
        '>',
        '>',
      );
    });

    it('should execute notifyHandler for each result from xreadgroup', async () => {
      xreadgroupMock.mockResolvedValue([
        ['test', [{ test: 'test' }]],
        ['test2', [{ test: 'test' }]],
      ]);
      server['redis'] = {
        xreadgroup: xreadgroupMock,
      } as any;
      await server['listenOnStreams'](true);
      expect(notifyHandlerMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('notifyHandler', () => {
    let processMessageMock: jest.Mock;
    let sendResponseMock: jest.Mock;
    beforeEach(() => {
      processMessageMock = jest.fn();
      sendResponseMock = jest.fn();

      server['processMessage'] = processMessageMock;
      server['sendResponse'] = sendResponseMock;
    });

    it('should call processMessage and sendResponse for each message', async () => {
      const message = ['stream_key', ['test']];
      const stream = 'test';
      await server['notifyHandler'](stream, [message]);
      expect(processMessageMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).toHaveBeenCalledTimes(1);
    });

    it('should catch and log any errors', async () => {
      processMessageMock.mockRejectedValue(new Error('test'));
      await server['notifyHandler']('test', [['test']]);
      expect(processMessageMock).toHaveBeenCalledTimes(1);
      expect(sendResponseMock).not.toHaveBeenCalled();
    });
  });

  describe('sendResponse', () => {
    let response$Mock: Observable<any>;
    let ctxMock: RedisStreamContext;
    let sendMock: jest.Mock;
    beforeEach(() => {
      response$Mock = new Observable();
      ctxMock = new RedisStreamContext(['test', 'test', 'test', 'test']);
      sendMock = jest.fn();
      server['send'] = sendMock;
    });

    it('should call send with the correct arguments', async () => {
      await server['sendResponse'](response$Mock, ctxMock);
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleRespondBack', () => {
    let response: StreamResponse;
    let inboundContext: RedisStreamContext;
    let publishResponsesMock: jest.Mock;
    let handleAckMock: jest.Mock;
    beforeEach(() => {
      response = null;
      inboundContext = new RedisStreamContext(['test', 'test', 'test', 'test']);
      handleAckMock = jest.fn();
      publishResponsesMock = jest.fn().mockResolvedValue(true);
      server['handleAck'] = handleAckMock;
      server['publishResponses'] = publishResponsesMock;
      server['redis'] = {} as any;
    });
    it('should call publishResponses and handleAck with the correct arguments', async () => {
      await server['handleRespondBack']({
        response,
        inboundContext,
        insDisposed: false,
      });
      expect(publishResponsesMock).toHaveBeenCalledTimes(1);
      expect(handleAckMock).toHaveBeenCalledTimes(1);
    });
    it('should return false if publishResponses fails', async () => {
      publishResponsesMock = jest.fn().mockResolvedValue(false);
      server['publishResponses'] = publishResponsesMock;
      const result = await server['handleRespondBack']({
        response,
        inboundContext,
        insDisposed: false,
      });
      expect(result).toBeFalsy();
    });
  });

  describe('publishResponses', () => {
    let responses: StreamResponse;
    let inboundContext: RedisStreamContext;
    beforeEach(() => {
      responses = null;
      inboundContext = new RedisStreamContext(['test', 'test', 'test', 'test']);
      server['redis'] = {} as any;
      server['client'] = {} as any;
      server['handleResponse'] = jest.fn().mockResolvedValue(true);
    });
    it('should return true if responses is null', async () => {
      const result = await server['publishResponses'](
        responses,
        inboundContext,
      );
      expect(result).toBeTruthy();
    });
    it('should return true if responses is true', async () => {
      responses = true;
      const result = await server['publishResponses'](
        responses,
        inboundContext,
      );
      expect(result).toBeTruthy();
    });
    it('should return true if responses is an array', async () => {
      responses = [] as StreamResponse;
      const result = await server['publishResponses'](
        responses,
        inboundContext,
      );
      expect(result).toBeTruthy();
    });
    it('should return true if responses is an object', async () => {
      responses = {
        payload: {
          headers: {},
          value: {},
        },
        stream: 'test',
      };
      const result = await server['publishResponses'](
        responses,
        inboundContext,
      );
      expect(result).toBeTruthy();
    });

    it('should return false if client is undefined', async () => {
      server['client'] = undefined;
      responses = [] as StreamResponse;
      const result = await server['publishResponses'](
        responses,
        inboundContext,
      );
      expect(result).toBeFalsy();
    });
  });
});
