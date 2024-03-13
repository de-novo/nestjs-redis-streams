import { RedisStreamContext } from '../../lib/context/redis-stream.context';
import { RedisStreamResponseDeserializer } from '../../lib/serialization/redis-stream.deserializer';

describe('Redis Stream Deserializer', () => {
  const deserializer = new RedisStreamResponseDeserializer();
  let context: RedisStreamContext;
  beforeEach(() => {
    context = new RedisStreamContext();
  });

  const message = [
    'id',
    ['headers', '{"test":"test"}', 'value', '"test-value"'],
  ];

  it('should be defined', () => {
    expect(deserializer).toBeDefined();
  });
  it('should have a deserialize method', () => {
    expect(deserializer.deserialize).toBeDefined();
  });

  describe('deserialize', () => {
    it('should deserialize the message', () => {
      const deserialized = deserializer.deserialize(message, context);
      expect(deserialized).toEqual('test-value');
    });
    it('should set the message headers', () => {
      deserializer.deserialize(message, context);
      expect(context.getMessageHeaders()).toEqual({ test: 'test' });
    });
  });
});
