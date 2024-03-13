import { Logger } from '@nestjs/common';
import { CustomTransportStrategy, Server } from '@nestjs/microservices';
import { CONNECT_EVENT, ERROR_EVENT } from '@nestjs/microservices/constants';
import { Observable } from 'rxjs';
import { REDIST_STREAM } from '../contants';
import { RedisStreamContext } from '../context/redis-stream.context';
import { ServerConstructorOptions } from '../interface/contructor.options.interface';
import {
  RedisInstance,
  StreamResponse,
  StreamResponseObject,
} from '../interface/redis.interface';
import { createRedisConnection } from '../redis';
import { RedisStreamResponseDeserializer } from '../redis-stream.deserializer';
import { RedisStreamRequestSerializer } from '../redis-stream.serializer';

export class RedisStreamServer
  extends Server
  implements CustomTransportStrategy
{
  logger = new Logger(RedisStreamServer.name);
  private readonly transportID = REDIST_STREAM;
  private streamHandlerMap: Record<string, any> = {};
  private redis?: RedisInstance;
  private client?: RedisInstance;

  constructor(private readonly options: ServerConstructorOptions) {
    super();
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }
  //////////////////////////////////////////
  // connect and stream handlers
  //////////////////////////////////////////
  public async listen(callback: () => void) {
    this.redis = await this.initializeRedis(this.options, true);
    this.client = await this.initializeRedis(this.options);
    this.bindHandlers();
    callback();
  }

  private async initializeRedis(
    options: ServerConstructorOptions,
    isListener: boolean = false,
  ) {
    const redis = createRedisConnection(options.connection);
    this.handleConnectionError(redis);
    redis.on(CONNECT_EVENT, () => {
      this.logger.log(
        `Connected to Redis ${isListener ? 'Server' : 'Client'} at ${options.connection?.path}`,
      );
    });
    return redis;
  }

  async bindHandlers() {
    try {
      await Promise.all(
        [...this.messageHandlers.keys()].map(async (pattern: string) => {
          await this.registerStream(pattern);
        }),
      );
      this.listenOnStreams();
    } catch (e) {
      this.logger.error('bindHandlers', e);
      throw e;
    }
  }

  private async registerStream(pattern: string) {
    try {
      this.streamHandlerMap[pattern] = this.messageHandlers.get(pattern);
      await this.createConsumerGroup(
        pattern,
        this.options.streams.consumerGroup,
      );
    } catch (e) {
      this.handleErrorWithLogging('registerStream', e);
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
        this.handleErrorWithLogging('createConsumerGroup', error);
        return false;
      }
    }
  }

  private async listenOnStreams(testMode = false): Promise<void | boolean> {
    if (!this.redis) return;
    const consumerGroup = this.options.streams.consumerGroup;
    const consumer = this.options.streams.consumer;
    if (!consumerGroup || !consumer) {
      throw new Error('Consumer Group and Consumer must be defined');
    }
    const groups =
      (await this.redis.xreadgroup(
        'GROUP',
        consumerGroup,
        consumer,
        'BLOCK',
        this.options?.streams?.block || 0,
        'STREAMS',
        ...(Object.keys(this.streamHandlerMap) as string[]), // streams keys
        ...(Object.keys(this.streamHandlerMap) as string[]).map(() => '>'),
      )) || [];
    groups.forEach((group: any) => {
      const [stream, messages] = group;
      this.notifyHandler(stream, messages);
    });
    return testMode || this.listenOnStreams();
  }

  private async notifyHandler(stream: string, messages: any[]) {
    try {
      const handler = this.streamHandlerMap[stream];
      const consumer = this.options.streams.consumer;
      const consumerGroup = this.options.streams.consumerGroup;
      await Promise.all(
        messages.map(async (message) => {
          const ctx = this.createContext(
            stream,
            message,
            consumerGroup,
            consumer,
          );
          const response$ = await this.processMessage(handler, message, ctx);
          await this.sendResponse(response$, ctx);
        }),
      );
    } catch (e) {
      this.logger.error('server notifyHandler', e);
    }
  }

  private createContext(
    stream: string,
    message: any[],
    consumerGroup: string,
    consumer: string,
  ) {
    const [streamKey] = message;
    return new RedisStreamContext([stream, streamKey, consumerGroup, consumer]);
  }

  private async processMessage(
    handler: any,
    message: any,
    ctx: RedisStreamContext,
  ) {
    const parsedPayload = this.deserializer.deserialize(message, ctx);
    const response = await handler(parsedPayload, ctx);
    return this.transformToObservable(response);
  }

  private async sendResponse(
    response$: Observable<any>,
    ctx: RedisStreamContext,
  ): Promise<void> {
    const stageRespondBack = async (resObj: any) => {
      resObj.inboundContext = ctx;
      this.handleRepondBack(resObj);
    };
    if (response$) {
      this.send(response$, stageRespondBack);
    }
  }

  //////////////////////////////////////////
  // response handling
  //////////////////////////////////////////
  private async handleRepondBack({
    response,
    inboundContext,
  }: {
    response: StreamResponse;
    inboundContext: RedisStreamContext;
    insDisposed: boolean;
  }) {
    try {
      if (!this.redis) return;
      const publishedResponse = await this.publishResponses(
        response,
        inboundContext,
      );
      if (!publishedResponse) {
        throw new Error('Failed to publish response');
      }
      await this.handleAck(inboundContext);
    } catch (e) {
      this.logger.error('handleRepondBack', e);
    }
  }

  private async publishResponses(
    responses: StreamResponse,
    inboundContext: RedisStreamContext,
  ) {
    if (!responses || responses === true) return true;
    if (!this.client) return false;
    const responseArray = Array.isArray(responses) ? responses : [responses];
    await Promise.all(
      responseArray.map(async (response: StreamResponseObject) => {
        return this.handleResponse(response, inboundContext);
      }),
    );
    return true;
  }

  private async handleResponse(
    response: StreamResponseObject,
    inboundContext: RedisStreamContext,
  ) {
    if (!response.payload || !response.payload || !this.client) return false;
    const serializedEntries = await this.serializer.serialize(
      { ...response.payload, id: '' }, // id: '' is a temporary fix
      inboundContext,
    );
    await this.client.xadd(response.stream, '*', ...serializedEntries);
    return true;
  }

  private async handleAck(inboundContext: RedisStreamContext) {
    try {
      if (!this.client) return;
      const stream = inboundContext.getStream();
      const consumerGroup = inboundContext.getConsumerGroup();
      const messageId = inboundContext.getMessageId();
      if (!stream || !consumerGroup || !messageId) {
        throw new Error('Invalid inbound context for ACK.');
      }

      await this.client.xack(stream, consumerGroup, messageId);
      if (this.options.streams.deleteMessagesAfterAck) {
        await this.client.xdel(stream, messageId);
      }
      return true;
    } catch (error) {
      this.logger.error('handleAck', error);
      return false;
    }
  }

  //////////////////////////////////////////
  // serialization and deserialization initialization
  //////////////////////////////////////////
  protected initializeSerializer(options: ServerConstructorOptions) {
    this.serializer =
      (options && options.serialization?.serializer) ||
      new RedisStreamRequestSerializer();
  }

  protected initializeDeserializer(options: ServerConstructorOptions) {
    this.deserializer =
      (options && options.serialization?.deserializer) ||
      new RedisStreamResponseDeserializer();
  }

  //////////////////////////////////////////
  // Error Handling
  //////////////////////////////////////////
  public handleError(stream: any) {
    stream.on(ERROR_EVENT, (err: any) => {
      this.logger.error('Redis Streams Server ' + err);
      this.close();
    });
  }

  handleConnectionError(client: RedisInstance) {
    client.on(ERROR_EVENT, (err) => {
      this.logger.error('Reids Error', err);
      this.close();
    });
  }

  private handleErrorWithLogging(context: string, error: any) {
    this.logger.error(`${context}: ${error.message}`, error.stack);
    this.close();
  }

  close() {
    this.redis && this.redis.disconnect();
    this.client && this.client.disconnect();
    this.redis = undefined;
    this.client = undefined;
    this.logger.verbose('Redis Streams Server Disconnected');
  }
}
