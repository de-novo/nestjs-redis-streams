import { ReadPacket } from '@nestjs/microservices';
import { RedisStreamClient } from '../../lib';
import { RedisConnectionOptions } from '../../lib/interface/redis-stream.interface';
import { ClientConstructorOptions } from '../../lib/interface/redis-stream.options.interface';
import { RedisStreamResponseDeserializer } from '../../lib/serialization/redis-stream.deserializer';
import { RedisStreamRequestSerializer } from '../../lib/serialization/redis-stream.serializer';

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
describe('RedisStreamClient', () => {
  let client: RedisStreamClient;
  let options: ClientConstructorOptions; // 옵션을 적절히 설정하세요.

  beforeEach(() => {
    options = {
      connection: {} as RedisConnectionOptions,
      responsePattern: ['testPattern'],
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

    client = new RedisStreamClient(options);
    // Redis 메소드 목킹
    client['redis'] = {
      xreadgroup: jest.fn().mockResolvedValue([]),
      xgroup: jest.fn().mockResolvedValue(''),
      disconnect: jest.fn(),
      xack: jest.fn().mockResolvedValue(''),
    } as any;

    client['client'] = {
      xreadgroup: jest.fn().mockResolvedValue([]),
      disconnect: jest.fn(),
      xadd: jest.fn().mockResolvedValue(''),
      xack: jest.fn().mockResolvedValue(''),
    } as any;

    client['connection'] = {
      on: jest.fn(),
      once: jest.fn(),
      quit: jest.fn(),
      connect: jest.fn().mockResolvedValue(''),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should initialize connection on first call', async () => {
      client['initialize'] = jest.fn().mockResolvedValue(undefined);
      client['redis'] = undefined;
      client['client'] = undefined;
      client['connection'] = undefined;
      await client.connect();
      expect(client['initialize']).toHaveBeenCalled();
    });

    it('should not initialize connection on subsequent calls', async () => {
      client['initialize'] = jest.fn().mockResolvedValue(undefined);
      await client.connect();
      expect(client['initialize']).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should disconnect both redis and client instances', async () => {
      const redisDisconnect = jest.fn();
      client['redis'] = {
        disconnect: redisDisconnect,
      } as any;
      const clientDisconnect = jest.fn();
      client['client'] = {
        disconnect: clientDisconnect,
      } as any;
      await client.close();
      expect(redisDisconnect).toHaveBeenCalled();
      expect(clientDisconnect).toHaveBeenCalled();
      expect(client['redis']).toBeUndefined();
      expect(client['client']).toBeUndefined();
    });
  });

  describe('connect and close', () => {
    it('should initialize, connect, and then close the connection', async () => {
      client['listenOnStreams'] = jest.fn().mockResolvedValue(true);
      await client.connect();
      expect(client['redis']).toBeDefined();
      expect(client['client']).toBeDefined();
      expect(client['connection']).toBeDefined();

      await client.close();
      expect(client['redis']).toBeUndefined();
      expect(client['client']).toBeUndefined();
      expect(client['connection']).toBeUndefined();
    });
  });

  describe('Message Processing', () => {
    it('should process and acknowledge messages correctly', async () => {
      const mockMessage = { id: 'test-message-id', data: 'test-data' };
      client['processMessage'] = jest.fn().mockResolvedValue(mockMessage);
      client['handleAck'] = jest.fn().mockResolvedValue(true);
      client['redis'] = {
        xreadgroup: jest
          .fn()
          .mockResolvedValue([
            ['test-stream', [[mockMessage.id, mockMessage.data]]],
          ]),
      } as any;
      // simulate receiving a message
      await client['listenOnStreams'](true); // Adjust based on actual implementation
      expect(client['processMessage']).toHaveBeenCalledTimes(1);
    });
  });

  describe('publish', () => {
    const pattern = 'testPattern';
    const mockPacket: ReadPacket = {
      pattern,
      data: { data: 'data' },
    };
    it('should publish messages correctly', async () => {
      client['serializer']['serialize'] = jest.fn().mockResolvedValue(['test']);
      const mockXadd = jest.fn().mockResolvedValue('test');
      client['client'] = {
        xadd: mockXadd,
      } as any;

      await client['publish'](mockPacket, () => {});
      expect(client['serializer']['serialize']).toHaveBeenCalled();
      expect(mockXadd).toHaveBeenCalled();
    });
  });

  describe('handleXadd', () => {
    it('should call client.xadd with the correct arguments and return the response', async () => {
      const stream = 'my-stream';
      const serializedPayloadArray = ['field1', 'value1', 'field2', 'value2'];
      const mockXadd = jest.fn().mockResolvedValue('1234');

      client['client'] = {
        xadd: mockXadd,
        disconnect: jest.fn().mockReturnThis(),
      } as any;

      const response = await client['handleXadd'](
        stream,
        serializedPayloadArray,
      );

      expect(mockXadd).toHaveBeenCalledWith(
        stream,
        '*',
        'field1',
        'value1',
        'field2',
        'value2',
      );
      // Assert that xadd is called with the correct arguments
      expect(response).toBeDefined();
    });
    it('should log an error if an error occurs during xadd', async () => {
      const stream = 'my-stream';
      const serializedPayloadArray = ['field1', 'value1', 'field2', 'value2'];
      const error = new Error('XADD error');
      const mockXadd = jest.fn().mockRejectedValue(error);
      client['client'] = {
        xadd: mockXadd,
        disconnect: jest.fn(),
      } as any;
      client['generatehandleError'] = jest.fn().mockReturnValue(() => {});
      await client['handleXadd'](stream, serializedPayloadArray);
      expect(mockXadd).toHaveBeenCalledWith(
        stream,
        '*',
        'field1',
        'value1',
        'field2',
        'value2',
      ); // Assert that xadd is called with the correct arguments
      expect(client['generatehandleError']).toHaveBeenCalled();
    });
  });

  describe('getOrGenerateCorrelationId', () => {
    beforeEach(() => {
      client['generateCorrelationId'] = jest.fn().mockReturnValue('test-id');
    });
    it('should generate and return a new correlation_id if none exists in the packet.', () => {
      const packet = {};
      const result = client['getOrGenerateCorrelationId'](packet);
      expect(result.correlation_id).toBe('test-id');
      expect(result.fromPacket).toBe(false);
    });

    it('should return the correlation_id from the headers if it exists', () => {
      const packet = {
        data: { correlation_id: 'existing-id' },
      };
      const result = client['getOrGenerateCorrelationId'](packet);
      expect(result.correlation_id).toBe('existing-id');
      expect(result.fromPacket).toBe(true);
    });
  });

  describe('initializeSerializer', () => {
    it('should use the provided serializer if one is given', () => {
      const customSerializer = { serialize: jest.fn() };
      const options: ClientConstructorOptions = {
        serialization: {
          serializer: customSerializer,
        },
      } as any;

      client['initializeSerializer'](options);
      expect(client['serializer']).toBe(customSerializer);
    });

    it('should use the default RedisStreamRequestSerializer if no serializer is provided', () => {
      const options: ClientConstructorOptions = {} as any;

      const defaultSerializerSpy = jest.spyOn(
        RedisStreamRequestSerializer.prototype,
        'serialize',
      );

      client['initializeSerializer'](options);
      expect(client['serializer']).toBeInstanceOf(RedisStreamRequestSerializer);
      expect(client['serializer'].serialize).toBeDefined();
      expect(defaultSerializerSpy).not.toHaveBeenCalled(); // Ensures method is not called, just checks instance
      defaultSerializerSpy.mockRestore();
    });
  });

  describe('initializeDeserializer', () => {
    it('should use the provided deserializer if one is given', () => {
      const customDeserializer = { deserialize: jest.fn() };
      const options: ClientConstructorOptions = {
        serialization: {
          deserializer: customDeserializer,
        },
      } as any;

      client['initializeDeserializer'](options);
      expect(client['deserializer']).toBe(customDeserializer);
    });

    it('should use the default RedisStreamResponseDeserializer if no deserializer is provided', () => {
      const options: ClientConstructorOptions = {} as any;

      const defaultDeserializerSpy = jest.spyOn(
        RedisStreamResponseDeserializer.prototype,
        'deserialize',
      );

      client['initializeDeserializer'](options);
      expect(client['deserializer']).toBeInstanceOf(
        RedisStreamResponseDeserializer,
      );
      expect(client['deserializer'].deserialize).toBeDefined();
      expect(defaultDeserializerSpy).not.toHaveBeenCalled();

      defaultDeserializerSpy.mockRestore();
    });
  });

  // describe('stream processing', () => {
  //   it('should handle stream messages correctly', async () => {
  //     const stream = 'test-stream';
  //     const messages = [['test-message-id', ['test', 'test']]];
  //     client['redis'] = {
  //       ...client['redis'],
  //       xreadgroup: jest.fn().mockResolvedValue([[stream, messages]]),
  //     } as any;
  //     await client['listenOnStreams'](true); // 테스트 모드로 실행
  //     expect(client['redis']?.xreadgroup).toHaveBeenCalledTimes(1);
  //   });

  //   it('should gracefully handle deserialization errors', async () => {
  //     client['processMessage'] = jest.fn().mockImplementation(() => {
  //       throw new Error('Deserialization failed');
  //     });

  //     const stream = 'test-stream';
  //     const messages = [['test-message-id', ['test', 'test']]];

  //     await expect(client['processMessages'](stream, messages)).rejects.toThrow(
  //       'Deserialization failed',
  //     );
  //   });
  // });

  // describe('Error Handling', () => {
  //   it('should log and handle initialization errors correctly', async () => {
  //     // jest
  //     //   .spyOn(client, 'initializeRedisClient')
  //     //   .mockRejectedValue(new Error('Initialization failed'));
  //     client['initializeRedisClient'] = jest
  //       .fn()
  //       .mockRejectedValue(new Error('Initialization failed'));
  //     expect(await client.connect()).rejects.toThrow('Initialization failed');
  //     expect(client['logger'].error).toHaveBeenCalledWith(
  //       expect.any(String),
  //       expect.any(Error),
  //     );
  //   });
  // });

  // describe('initialize', () => {
  //   let mockInitializeRedisClient: jest.Mock;
  //   let mockInitListener: jest.Mock;

  //   beforeEach(() => {
  //     mockInitializeRedisClient = jest
  //       .fn()
  //       .mockResolvedValue('mockRedisInstance');
  //     mockInitListener = jest.fn().mockResolvedValue(undefined);
  //     client['initializeRedisClient'] = mockInitializeRedisClient;
  //     client['initListener'] = mockInitListener;
  //   });

  //   it('should be defined', () => {
  //     expect(client['initialize']).toBeDefined();
  //   });

  //   it('should successfully initialize', async () => {
  //     // listenOnStream is Recursive function
  //     client['listenOnStreams'] = jest.fn().mockResolvedValue(true);
  //     await client['initialize']();
  //     expect(client['redis']).toBeDefined();
  //     expect(client['client']).toBeDefined();
  //     expect(client['connection']).toBeDefined();
  //   });

  //   it('should log and rethrow error on initialization failure', async () => {
  //     // 초기화 실패를 시뮬레이션합니다.
  //     const error = new Error('Initialization failed');
  //     mockInitializeRedisClient.mockRejectedValueOnce(error);
  //     // initialize 호출 시 예상되는 에러가 throw 되는지 확인합니다.
  //     await expect(client['initialize']()).rejects.toThrow(error);
  //   });
  // });

  // describe('initializeRedisClient', () => {
  //   it('should be defined', () => {
  //     expect(client['initializeRedisClient']).toBeDefined();
  //   });

  //   it('should initialize redis client', async () => {
  //     const result = await client['initializeRedisClient']();
  //     expect(result).toBeDefined();
  //   });
  // });

  // describe('listenOnStreams', () => {
  //   it('should be defined', () => {
  //     expect(client['listenOnStreams']).toBeDefined();
  //   });

  //   it('return undefined Redis undefined', async () => {
  //     client['redis'] = undefined;
  //     await client['listenOnStreams']();
  //     expect(client['redis']).toBeUndefined();
  //   });

  //   it('should handle missing streams options gracefully', async () => {
  //     client = new RedisStreamClient({
  //       streams: {},
  //     } as any);
  //     const result = await client['listenOnStreams']();
  //     expect(result).toBeFalsy();
  //   });

  //   it('should proceed without error when only consumer is specified in streams options', async () => {
  //     client = new RedisStreamClient({
  //       streams: {
  //         consumer: 'test',
  //       },
  //     } as any);
  //     const reuslt = await client['listenOnStreams']();
  //     expect(reuslt).toBeFalsy();
  //   });

  //   it('should proceed without error when only consumerGroup is specified in streams options', async () => {
  //     client = new RedisStreamClient({
  //       streams: {
  //         consumerGroup: 'test',
  //       },
  //     } as any);
  //     const result = await client['listenOnStreams']();
  //     expect(result).toBeFalsy();
  //   });

  //   it('correctly processes a single message batch from the stream', async () => {
  //     const strema = 'test-stream';
  //     const messages = [['test-message-id', ['test', 'test']]];
  //     client['redis'] = {
  //       xreadgroup: jest.fn().mockResolvedValue([[strema, messages]]),
  //     } as any;
  //     client['processMessages'] = jest.fn().mockResolvedValue(true);
  //     await client['listenOnStreams'](true);
  //     expect(client['redis']?.xreadgroup).toHaveBeenCalledTimes(1);
  //     expect(client['processMessages']).toHaveBeenCalledTimes(1);
  //     expect(client['processMessages']).toHaveBeenCalledWith(strema, messages);
  //   });

  //   it('correctly processes multiple message batches from the stream', async () => {
  //     const strema = 'test-stream';
  //     const messages = [['test-message-id', ['test', 'test']]];
  //     client['redis'] = {
  //       xreadgroup: jest.fn().mockResolvedValue([
  //         [strema, messages],
  //         [strema, messages],
  //       ]),
  //     } as any;
  //     client['processMessages'] = jest.fn().mockResolvedValue(true);
  //     await client['listenOnStreams'](true);
  //     expect(client['redis']?.xreadgroup).toHaveBeenCalledTimes(1);
  //     expect(client['processMessages']).toHaveBeenCalledTimes(2);
  //     expect(client['processMessages']).toHaveBeenCalledWith(strema, messages);
  //   });
  // });

  // describe('processMessages', () => {
  //   beforeEach(() => {
  //     jest.clearAllMocks();
  //   });
  //   it('should be defined', () => {
  //     expect(client['processMessages']).toBeDefined();
  //   });

  //   it('should process messages', async () => {
  //     client['processMessage'] = jest.fn().mockResolvedValue(true);
  //     const stream = 'test-stream';
  //     const messages = [['test-message-id', ['test', 'test']]];
  //     await client['processMessages'](stream, messages);
  //     expect(client['processMessage']).toHaveBeenCalledTimes(1);
  //   });

  //   it('should handle messages array', async () => {
  //     client['processMessage'] = jest.fn().mockResolvedValue(true);
  //     const stream = 'test-stream';
  //     const messages = [
  //       ['test-message-id', ['test', 'test']],
  //       ['test-message-id', ['test', 'test']],
  //     ];
  //     await client['processMessages'](stream, messages);
  //     expect(client['processMessage']).toHaveBeenCalledTimes(2);
  //   });

  //   it('should handle empty messages array', async () => {
  //     client['processMessage'] = jest.fn().mockResolvedValue(true);
  //     const stream = 'test-stream';
  //     const messages = [] as any[];
  //     await client['processMessages'](stream, messages);
  //     expect(client['processMessage']).toHaveBeenCalledTimes(0);
  //   });
  // });

  // describe('processMessage', () => {
  //   it('should be defined', () => {
  //     expect(client['processMessage']).toBeDefined();
  //   });

  //   it('invokes deserializer with the correct parameters', async () => {
  //     const stream = 'test-stream';
  //     const message = ['test-message-id', ['test', 'test']];
  //     client['deserializer']['deserialize'] = jest.fn().mockResolvedValue(true);
  //     await client['processMessage'](stream, message);
  //     expect(client['deserializer'].deserialize).toHaveBeenCalledWith(
  //       message,
  //       expect.any(RedisStreamContext),
  //     );
  //   });

  //   it('returns undefined when deserialization fails', async () => {
  //     const stream = 'test-stream';
  //     const message = ['test-message-id', ['test', 'test']];
  //     const error = new Error('Deserialization failed');
  //     client['deserializer']['deserialize'] = jest
  //       .fn()
  //       .mockRejectedValue(error);
  //     const result = await client['processMessage'](stream, message);
  //     expect(result).toBeUndefined();
  //   });

  //   it('acknowledges message without correlation_id', async () => {
  //     const stream = 'test-stream';
  //     const message = ['test-message-id', ['test', 'test']];
  //     client['deserializer']['deserialize'] = jest.fn().mockResolvedValue({
  //       headers: {},
  //     });
  //     client['handleAck'] = jest.fn().mockResolvedValue(true);
  //     await client['processMessage'](stream, message);
  //     expect(client['handleAck']).toHaveBeenCalledTimes(1);
  //   });

  //   it('delivers message with correlation_id to handler', async () => {
  //     const stream = 'test-stream';
  //     const message = ['test-message-id', ['test', 'test']];
  //     client['deserializer']['deserialize'] = jest
  //       .fn()
  //       .mockImplementation((_, ctx) => {
  //         ctx['headers']['correlation_id'] = 'test';
  //       });
  //     client['deliverToHandler'] = jest.fn().mockResolvedValue(true);
  //     await client['processMessage'](stream, message);
  //     expect(client['deliverToHandler']).toHaveBeenCalledTimes(1);
  //   });
  // });

  // describe('deliverToHandler', () => {
  //   let ctx: RedisStreamContext;
  //   beforeEach(() => {
  //     ctx = new RedisStreamContext();
  //   });
  //   afterEach(() => {
  //     jest.clearAllMocks();
  //   });

  //   it('should be defined', () => {
  //     expect(client['deliverToHandler']).toBeDefined();
  //   });
  // });
});
