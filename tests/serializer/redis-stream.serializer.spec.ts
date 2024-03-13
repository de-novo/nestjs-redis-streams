import { RedisStreamContext } from '../../lib/context/redis-stream.context';
import { RedisStreamRequestSerializer } from '../../lib/serialization/redis-stream.serializer';

describe('Redis Stream Serializer', () => {
  const serializer = new RedisStreamRequestSerializer();
  const context = new RedisStreamContext().setMessageHeaders({ test: 'test' });
  const payload = {
    value: 'test-value',
    headers: {
      test: 'test',
    },
  };

  it('should be defined', () => {
    expect(serializer).toBeDefined();
  });
  it('should have a serialize method', () => {
    expect(serializer.serialize).toBeDefined();
  });

  it('should serialize the payload', () => {
    const serialized = serializer.serialize(payload, context);
    expect(serialized).toEqual([
      'headers',
      '{"test":"test"}',
      'value',
      '"test-value"',
    ]);
  });
});
