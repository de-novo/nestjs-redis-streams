import { RedisStreamContext } from '../../lib/context/redis-stream.context';

describe('Redis Stream Context', () => {
  const stream = 'test-stream';
  const message_id = 'test-message-id';
  const group = 'test-group';
  const consumer = 'test-consumer';

  let context: RedisStreamContext;
  beforeEach(() => {
    context = new RedisStreamContext([stream, message_id, group, consumer]);
  });

  describe('getStream', () => {
    it('should be defined', () => {
      expect(context.getStream).toBeDefined();
    });
    it('should return the stream', () => {
      expect(context.getStream()).toEqual(stream);
    });
  });

  describe('setStream', () => {
    it('should be defined', () => {
      expect(context.setStream).toBeDefined();
    });
    it('should set the stream', () => {
      const newStream = 'new-test-stream';
      context.setStream(newStream);
      expect(context.getStream()).toEqual(newStream);
    });
  });

  describe('getMessageId', () => {
    it('should be defined', () => {
      expect(context.getMessageId).toBeDefined();
    });
    it('should return the message id', () => {
      expect(context.getMessageId()).toEqual(message_id);
    });
  });

  describe('setMessageId', () => {
    it('should be defined', () => {
      expect(context.setMessageId).toBeDefined();
    });
    it('should set the message id', () => {
      const newMessageId = 'new-test-message-id';
      context.setMessageId(newMessageId);
      expect(context.getMessageId()).toEqual(newMessageId);
    });
  });

  describe('getConsumerGroup', () => {
    it('should be defined', () => {
      expect(context.getConsumerGroup).toBeDefined();
    });
    it('should return the consumer group', () => {
      expect(context.getConsumerGroup()).toEqual(group);
    });
  });

  describe('setConsumerGroup', () => {
    it('should be defined', () => {
      expect(context.setConsumerGroup).toBeDefined();
    });
    it('should set the consumer group', () => {
      const newGroup = 'new-test-group';
      context.setConsumerGroup(newGroup);
      expect(context.getConsumerGroup()).toEqual(newGroup);
    });
  });

  describe('getConsumer', () => {
    it('should be defined', () => {
      expect(context.getConsumer).toBeDefined();
    });
    it('should return the consumer', () => {
      expect(context.getConsumer()).toEqual(consumer);
    });
  });

  describe('setConsumer', () => {
    it('should be defined', () => {
      expect(context.setConsumer).toBeDefined();
    });
    it('should set the consumer', () => {
      const newConsumer = 'new-test-consumer';
      context.setConsumer(newConsumer);
      expect(context.getConsumer()).toEqual(newConsumer);
    });
  });

  describe('getMessageHeaders', () => {
    it('should be defined', () => {
      expect(context.getMessageHeaders).toBeDefined();
    });
    it('should return the headers', () => {
      expect(context.getMessageHeaders()).toEqual({});
    });
  });

  describe('setMessageHeaders', () => {
    it('should be defined', () => {
      expect(context.setMessageHeaders).toBeDefined();
    });
    it('should set the headers', () => {
      const headers = { test: 'test' };
      context.setMessageHeaders(headers);
      expect(context.getMessageHeaders()).toEqual(headers);
    });
  });

  describe('addMessageHeader', () => {
    it('should be defined', () => {
      expect(context.addMessageHeader).toBeDefined();
    });
    it('should add a header', () => {
      const key = 'test';
      const value = 'test';
      context.addMessageHeader(key, value);
      expect(context.getMessageHeaders()).toEqual({ [key]: value });
    });
  });

  describe('get', () => {
    it('should be defined', () => {
      expect(context.get).toBeDefined();
    });
    it('should return the context args', () => {
      expect(context.get()).toEqual([stream, message_id, group, consumer]);
    });
  });
});
