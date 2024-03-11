import { Injectable, Logger } from '@nestjs/common';
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';
import { CONNECT_EVENT, ERROR_EVENT } from '@nestjs/microservices/constants';
import { Observable, firstValueFrom, share } from 'rxjs';
import { v4 } from 'uuid';
import { RedisStreamContext } from '../context/redis-stream.context';
import { ClientConstructorOptions } from '../interface/contructor.options.interface';
import {
  MessageInput,
  RedisConnectionOptions,
  RedisInstance,
} from '../interface/redis.interface';
import { createRedisConnection } from '../redis';
import { RedisStreamResponseDeserializer } from '../redis-stream.deserializer';
import { RedisStreamRequestSerializer } from '../redis-stream.serializer';

export class RequestsMap<T extends string | number | symbol, S> {
  private map: Record<T, S>;

  constructor() {
    this.map = {} as Record<T, S>;
  }

  public addEntry(requestId: T, handler: S): boolean {
    this.map[requestId] = handler;
    return true;
  }

  public getEntry(requestId: T): S | undefined {
    return this.map[requestId];
  }

  public removeEntry(requestId: T): boolean {
    delete this.map[requestId];
    return true;
  }

  public getMap(): Record<T, S> {
    return this.map;
  }
}

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
    this.responsePatterns = this.options?.responesePattern ?? [];
    this.initialize();
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  // send
  send<TResult = any, TInput = MessageInput>(
    pattern: any,
    input: TInput,
  ): Observable<TResult> {
    return super.send<TResult, TInput>(pattern, input);
  }

  /**
   * connect
   */
  async connect(): Promise<any> {
    if (this.client) {
      return this.connection;
    }
    this.connection = await firstValueFrom(
      this.connect$(this.client, ERROR_EVENT, CONNECT_EVENT).pipe(share()),
    );
    return this.connection;
  }

  /**
   * initialize
   *
   * this method is called in the constructor to initialize the redis client and the listener.
   *
   * if the client or the listener fails to initialize, an error is thrown.
   */
  private async initialize() {
    this.redis = await this.initializeRedisClient(
      this.options.connection,
      true,
    );
    this.client = await this.initializeRedisClient(this.options.connection);
    if (!this.redis) {
      throw new Error('Redis Stream Listener failed to initialize.');
    }
    if (!this.client) {
      throw new Error('Redis Stream Client failed to initialize.');
    }
    await this.initListener();
  }

  /**
   * initListener
   *
   * this method is called in the initialize method to initialize the listener.
   *
   * check and create the consumer group for each response stream.
   */
  private async initListener() {
    try {
      if (this.responsePatterns.length === 0) {
        this.logger.warn('No response streams to listen on.');
        return;
      }
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
  private async listenOnStreams(): Promise<void> {
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
        this.notifyHandlers(stream, messages);
      });

      return this.listenOnStreams();
    } catch (error) {
      this.generatehandleError('listenOnStreams')(error);
    }
  }

  /**
   * notifyHandlers
   *
   * this method is called in the listenOnStreams method to notify the handlers of the messages.
   *
   * if catch an error, close the connection.
   */
  private async notifyHandlers(stream: string, messages: any[]) {
    try {
      await Promise.all(
        messages.map(async (message) => {
          const ctx = new RedisStreamContext([
            stream,
            message[0], // message id needed for ACK.
            this.options?.streams?.consumerGroup,
            this.options?.streams?.consumer,
          ]);
          const payload = await this.deserializer.deserialize(message, ctx);
          const headers = ctx.getMessageHeaders();
          if (!headers.correlation_id) {
            await this.handleAck(ctx);
            return;
          }
          await this.deliverToHandler(headers.correlation_id, payload, ctx);
          return;
        }),
      );
    } catch (error) {
      this.generatehandleError('notifyHandlers')(error);
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
      if (!this.client) return;
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

      // if (payload?.error) {
      //   callback({
      //     err: payload.error,
      //     response: null,
      //     isDisposed: true,
      //     status: 'error',
      //   });
      // } else {
      //   callback({
      //     err: null,
      //     response: payload,
      //     isDisposed: true,
      //     status: 'success',
      //   });
      // }

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
        this.handleErrorWithLogging('createConsumerGroup', error);
        return false;
      }
    }
  }

  private async initializeRedisClient(
    connectionOptions?: RedisConnectionOptions,
    isListener: boolean = false,
  ): Promise<RedisInstance | undefined> {
    try {
      const redis = createRedisConnection(connectionOptions);
      this.connection = await firstValueFrom(
        this.connect$(redis, ERROR_EVENT, CONNECT_EVENT).pipe(share()),
      );
      this.logger.log(
        `Redis ${isListener ? 'Listener' : 'Client'} connected successfully.`,
      );
      this.instanceErrorHandling(
        redis,
        `Redis ${isListener ? 'Listener' : 'Client'}`,
      );
      return redis;
    } catch (error) {
      this.handleErrorWithLogging('initializeRedisClient', error);
      return undefined;
    }
  }

  protected dispatchEvent<T = any>(packet: ReadPacket): Promise<T> {
    const { pattern, data } = packet;
    const { correlation_id, fromPacket } =
      this.getOrGenerateCorrelationId(packet);
    if (!fromPacket) {
      packet.data.correlation_id = correlation_id;
    }
    return new Promise(() =>
      this.publishStream({ pattern, data: { ...data, correlation_id } }),
    );
  }

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
      this.handleErrorWithLogging('publishStream', error);
    }
  }

  private generateCorrelationId() {
    return v4();
  }

  private async handleXadd(stream: string, serializedPayloadArray: any[]) {
    if (!this.client) return;
    try {
      return await this.client.xadd(stream, '*', ...serializedPayloadArray);
    } catch (error) {
      this.handleErrorWithLogging('handleXadd', error);
    }
  }

  protected publish(
    partialPacket: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): any {
    try {
      const { correlation_id, fromPacket } =
        this.getOrGenerateCorrelationId(partialPacket);
      // if the correlationId is not from the packet, add it to the packet, later the serializer will extract it.
      if (!fromPacket) {
        partialPacket.data.correlation_id = correlation_id;
      }
      this.requestsMap.addEntry(correlation_id, callback);
      this.publishStream(partialPacket);
    } catch (error) {
      this.logger.error('publish', error);
    }
  }

  public async close(): Promise<void> {
    this.redis?.disconnect();
    this.client?.disconnect();
    this.redis = undefined;
    this.client = undefined;
  }

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

  private handleErrorWithLogging(context: string, error: any) {
    this.logger.error(`${context}: ${error.message}`, error.stack);
    this.close();
  }

  public handleError(stream: any) {
    stream.on(ERROR_EVENT, (err: any) => {
      this.logger.error('Redis Streams Client ' + err);
      this.close();
    });
  }

  /// ERROR HANDLING
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
