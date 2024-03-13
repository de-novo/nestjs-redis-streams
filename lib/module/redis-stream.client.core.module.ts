import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { RedisStreamClient } from '../client/redis-stream.client';
import { REDIS_STREAM_CLIENT_MODULE_OPTIONS } from '../contants';
import {
  RedisStreamClientModuleOptionsFactory,
  RedisStreamModuleAsyncOptions,
} from '../interface/redis-stream.client.interface';
import { ClientConstructorOptions } from '../interface/redis-stream.options.interface';

@Global()
@Module({})
export class RedisStreamClientCoreModule {
  static forRoot(options: ClientConstructorOptions): DynamicModule {
    return {
      module: RedisStreamClientCoreModule,
      providers: [
        {
          provide: RedisStreamClient,
          useValue: new RedisStreamClient(options),
        },
      ],
      exports: [RedisStreamClient],
    };
  }

  /* forRootAsync */
  public static forRootAsync(
    options: RedisStreamModuleAsyncOptions,
  ): DynamicModule {
    const redisStreamClientProvider: Provider = {
      provide: RedisStreamClient,
      useFactory: (options: ClientConstructorOptions) => {
        return new RedisStreamClient(options);
      },
      inject: [REDIS_STREAM_CLIENT_MODULE_OPTIONS],
    };

    return {
      module: RedisStreamClientCoreModule,
      imports: options.imports,
      providers: [
        ...this.createAsyncProviders(options),
        redisStreamClientProvider,
      ],
      exports: [redisStreamClientProvider],
    };
  }

  /* createAsyncProviders */
  public static createAsyncProviders(
    options: RedisStreamModuleAsyncOptions,
  ): Provider[] {
    if (!(options.useExisting || options.useFactory || options.useClass)) {
      throw new Error(
        'Invalid configuration. Must provide useFactory, useClass or useExisting',
      );
    }

    if (options.useExisting || options.useFactory) {
      return [this.createAsyncClientProvider(options)];
    }

    return [
      this.createAsyncClientProvider(options),
      { provide: options.useClass!, useClass: options.useClass! },
    ];
  }

  /* createAsyncOptionsProvider */
  public static createAsyncClientProvider(
    options: RedisStreamModuleAsyncOptions,
  ): Provider {
    if (!(options.useExisting || options.useFactory || options.useClass)) {
      throw new Error(
        'Invalid configuration. Must provide useFactory, useClass or useExisting',
      );
    }

    // if is a useFactory, get options then return the RedisStreamClient
    if (options.useFactory) {
      return {
        provide: REDIS_STREAM_CLIENT_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }

    return {
      provide: REDIS_STREAM_CLIENT_MODULE_OPTIONS,
      useFactory: async (
        optionsFactory: RedisStreamClientModuleOptionsFactory,
      ) => optionsFactory.createRedisStreamClientModuleOptions(),
      inject: [options.useClass || options.useExisting] as any,
    };
  }
}