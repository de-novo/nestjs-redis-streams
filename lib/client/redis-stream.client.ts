import { Injectable, Logger } from '@nestjs/common';
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';
import { ERROR_EVENT } from '@nestjs/microservices/constants';
import { Observable } from 'rxjs';
import { v4 } from 'uuid';
import { RedisStreamContext } from '../context/redis-stream.context';
import {
  MessageInput,
  RedisConnectionOptions,
  RedisInstance,
} from '../interface/redis-stream.interface';
import { ClientConstructorOptions } from '../interface/redis-stream.options.interface';
import { RedisStreamResponseDeserializer } from '../serialization/redis-stream.deserializer';
import { RedisStreamRequestSerializer } from '../serialization/redis-stream.serializer';
import { createRedisConnection } from '../util/redisConnection';
import { RequestsMap } from '../util/requestMap';

@Injectable()
export class RedisStreamClient extends ClientProxy {
  protected readonly logger = new Logger(RedisStreamClient.name);
  private redis?: RedisInstance; // server instance for listening on response streams.
  private client?: RedisInstance; // client instance for publishing streams.
  protected connection?: Promise<any>; // client connection logic is required by framework.
  private responsePatterns: string[] = []; // response streams to listen on.
  private requestsMap: RequestsMap<string, any>;

  // hold the correlationIds and the observers.
  // To forward the response to the correct observer.

  constructor(private readonly options: ClientConstructorOptions) {
    super();
    this.requestsMap = new RequestsMap();
    this.responsePatterns = this.options?.responsePattern ?? [];
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  //////////////////////////////////////////
  // initialize and lifecycle methods
  //////////////////////////////////////////
  public async close(): Promise<void> {
    this.redis && this.redis.disconnect();
    this.client && this.client.disconnect();
    this.redis = undefined;
    this.client = undefined;
    this.connection = undefined;
  }

  public async connect(): Promise<any> {
    if (!this.connection) {
      await this.initialize();
    }
    return this.connection;
  }

  private async initialize() {
    try {
      this.redis = await this.initializeRedisClient(
        this.options.connection,
        true,
      );
      this.client = await this.initializeRedisClient(this.options.connection);
      this.connection = Promise.all([this.redis, this.client]);
      await this.connection;

      this.initListener().catch((error) => {
        this.logger.error('Failed to initialize listener', error);
      });
    } catch (error) {
      this.logger.error('Failed to initialize RedisStreamClient', error);
      throw error; // Rethrow to handle it in the caller or to log it.
    }
  }

  private async initializeRedisClient(
    connectionOptions?: RedisConnectionOptions,
    isListener: boolean = false,
  ): Promise<RedisInstance> {
    const redis = createRedisConnection(connectionOptions);
    this.logger.log(
      `Redis ${isListener ? 'Listener' : 'Client'} connected successfully.`,
    );
    this.instanceErrorHandling(
      redis,
      `Redis ${isListener ? 'Listener' : 'Client'}`,
    );
    return redis;
  }

  /**
   * initListener
   *
   * this method is called in the initialize method to initialize the listener.
   *
   * check and create the consumer group for each response stream.
   */
  private async initListener() {
    if (this.responsePatterns.length === 0) {
      this.logger.warn('No response streams to listen on.');
      return;
    }
    try {
      await Promise.all(
        this.responsePatterns.map(async (stream) => {
          await this.createConsumerGroup(
            stream,
            this.options.streams.consumerGroup,
          );
        }),
      );
      // start listening.
      this.listenOnStreams();
    } catch (error) {
      this.logger.error(
        'initListener',
        'Error while initializing the Redis Streams Listener from the client.',
        error,
      );
    }
  }

  /**
   * listenOnStreams
   *
   * this method is called in the initListener method to start listening on the response streams.
   */
  private async listenOnStreams(testMode = false): Promise<void | boolean> {
    try {
      if (!this.redis) return;
      if (!this.options.streams.consumer)
        throw new Error('Consumer name is required');
      if (!this.options.streams.consumerGroup)
        throw new Error('Consumer group is required');
      const results =
        (await this.redis.xreadgroup(
          'GROUP',
          this.options?.streams?.consumerGroup,
          this.options?.streams?.consumer,
          'BLOCK',
          this.options?.streams?.block || 0,
          'STREAMS',
          ...this.responsePatterns,
          ...this.responsePatterns.map(() => '>'),
        )) || [];
      results.forEach((result: any) => {
        const [stream, messages] = result;
        this.processMessages(stream, messages);
      });
      return testMode || this.listenOnStreams();
    } catch (error) {
      this.generatehandleError('listenOnStreams')(error);
      return false;
    }
  }

  private async processMessages(stream: string, messages: any[]) {
    await Promise.all(
      messages.map((message) => this.processMessage(stream, message)),
    );
  }

  private async processMessage(stream: string, message: any) {
    const ctx = new RedisStreamContext([
      stream,
      message[0],
      this.options.streams.consumerGroup,
      this.options.streams.consumer,
    ]);
    try {
      const payload = await this.deserializer.deserialize(message, ctx);
      const headers = ctx.getMessageHeaders();
      if (!headers.correlation_id) {
        return this.handleAck(ctx);
      }
      return this.deliverToHandler(headers.correlation_id, payload, ctx);
    } catch (error) {
      this.logger.error('processMessage', 'Failed to process message.', error);
    }
  }

  /**
   * deliverToHandler
   *
   * this method is called in the notifyHandlers method to deliver the message to the handler.
   */
  private async deliverToHandler(
    correlationId: string,
    payload: any,
    ctx: RedisStreamContext,
  ) {
    try {
      const callback: (packet: WritePacket) => void =
        this.requestsMap.getEntry(correlationId);
      // if no callback, could be that the message was not meant for this service,
      // or the message was fired by this service using the emit method, and not the send method, to fire
      // and forget. so no callback was provided.
      if (!callback) {
        await this.handleAck(ctx);
        this.logger.debug(
          'No callback found for a message with correlationId: ' +
            correlationId,
        );
        return;
      }

      this.handleCallback(callback, payload);
      await this.handleAck(ctx);
      this.requestsMap.removeEntry(correlationId);
    } catch (error) {
      this.logger.error(
        'deliverToHandler',
        'Error while delivering the message to the handler.',
        error,
      );
    }
  }

  /**
   * handleAck
   *
   * this method is called in the notifyHandlers method to acknowledge the message.
   * if catch an error, return false. not closing the connection.
   */
  private async handleAck(inboundContext: RedisStreamContext) {
    try {
      if (!this.client) return false;
      const stream = inboundContext.getStream();
      const consumerGroup = inboundContext.getConsumerGroup();
      const messageId = inboundContext.getMessageId();
      if (stream && consumerGroup && messageId) {
        await this.client.xack(stream, consumerGroup, messageId);
        return true;
      }
      throw new Error('Invalid inbound context for ACK.');
    } catch (error) {
      this.logger.error('handleAck', error);
      return false;
    }
  }

  private async createConsumerGroup(stream: string, group: string) {
    if (!this.redis) return;
    try {
      await this.redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
      return true;
    } catch (error: any) {
      if (error?.message && error.message.includes('BUSYGROUP')) {
        this.logger.debug(
          'Consumer Group "' + group + '" already exists for stream: ' + stream,
        );
        return true;
      } else {
        this.generatehandleError('createConsumerGroup')(error);
        return false;
      }
    }
  }
  //////////////////////////////////////////
  // publish and dispatch methods
  //////////////////////////////////////////
  send<TResult = any, TInput = MessageInput>(
    pattern: any,
    input: TInput,
  ): Observable<TResult> {
    return super.send<TResult, TInput>(pattern, input);
  }

  protected publish(
    partialPacket: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): any {
    try {
      const { correlation_id, fromPacket } =
        this.getOrGenerateCorrelationId(partialPacket);
      if (!fromPacket) {
        partialPacket.data.correlation_id = correlation_id;
      }
      this.requestsMap.addEntry(correlation_id, callback);
      this.publishStream(partialPacket);
    } catch (error) {
      this.logger.error('publish', error);
    }
  }

  protected async publishStream(partialPacket: ReadPacket) {
    try {
      const { pattern, data } = partialPacket;
      const ctx = new RedisStreamContext().setStream(pattern);

      const headers = data?.headers || {};
      const correlation_id = data?.correlation_id;
      ctx.setMessageHeaders({ ...headers, correlation_id });
      const serializedPayloadArray: string[] = await this.serializer.serialize(
        data,
        ctx,
      );
      const response = await this.handleXadd(pattern, serializedPayloadArray);
      return response;
    } catch (error) {
      this.generatehandleError('publishStream')(error);
    }
  }

  protected dispatchEvent(packet: ReadPacket): Promise<any> {
    const { pattern, data } = packet;
    const { correlation_id, fromPacket } =
      this.getOrGenerateCorrelationId(packet);
    if (!fromPacket) {
      packet.data.correlation_id = correlation_id;
    }
    return new Promise<void>((resolve, reject) =>
      // this.publishStream({ pattern, data: { ...data, correlation_id } }),
      this.publish({ pattern, data: { ...data, correlation_id } }, (err) =>
        err ? reject(err) : resolve(),
      ),
    );
  }

  private async handleXadd(stream: string, serializedPayloadArray: any[]) {
    if (!this.client) return;
    try {
      return await this.client.xadd(stream, '*', ...serializedPayloadArray);
    } catch (error) {
      this.generatehandleError('handleXadd')(error);
    }
  }

  //////////////////////////////////////////
  // callback and message handling methods
  //////////////////////////////////////////
  handleCallback(callback: (packet: WritePacket) => void, payload: any) {
    if (payload?.error) {
      callback({
        err: payload.error,
        response: null,
        isDisposed: true,
        status: 'error',
      });
      return;
    }
    callback({
      err: null,
      response: payload,
      isDisposed: true,
      status: 'success',
    });
    return;
  }

  //////////////////////////////////////////
  // utility methods
  //////////////////////////////////////////
  private getOrGenerateCorrelationId(packet: any) {
    const payload = packet.data;
    const correlation_id = payload?.correlation_id;
    if (correlation_id) {
      return {
        correlation_id,
        fromPacket: true,
      };
    }
    return {
      correlation_id: this.generateCorrelationId(),
      fromPacket: false,
    };
  }

  private generateCorrelationId() {
    return v4();
  }

  //////////////////////////////////////////
  // serialization and deserialization initialization
  //////////////////////////////////////////
  protected initializeSerializer(options: ClientConstructorOptions) {
    this.serializer =
      (options && options.serialization?.serializer) ||
      new RedisStreamRequestSerializer();
  }

  protected initializeDeserializer(options: ClientConstructorOptions) {
    this.deserializer =
      (options && options.serialization?.deserializer) ||
      new RedisStreamResponseDeserializer();
  }

  //////////////////////////////////////////
  // error handling
  //////////////////////////////////////////
  public instanceErrorHandling(
    stream: RedisInstance,
    context: string = 'Redis Stream Client',
  ) {
    stream.on(ERROR_EVENT, this.generatehandleError(context));
  }

  private generatehandleError(context: string) {
    return (err: any) => {
      this.logger.error(`${context}: ${err.message}`, err.stack);
      this.close();
    };
  }
}
