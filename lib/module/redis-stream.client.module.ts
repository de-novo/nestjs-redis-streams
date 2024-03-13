import { DynamicModule, Module } from '@nestjs/common';
import { RedisStreamModuleAsyncOptions } from '../interface/redis-stream.client.interface';
import { ClientConstructorOptions } from '../interface/redis-stream.options.interface';
import { RedisStreamClientCoreModule } from './redis-stream.client.core.module';

@Module({})
export class RedisStreamClientModule {
  public static register(options: ClientConstructorOptions): DynamicModule {
    return {
      module: RedisStreamClientModule,
      imports: [RedisStreamClientCoreModule.forRoot(options)],
      exports: [RedisStreamClientCoreModule],
    };
  }

  public static forRoot(options: ClientConstructorOptions): DynamicModule {
    return {
      module: RedisStreamClientModule,
      imports: [RedisStreamClientCoreModule.forRoot(options)],
      exports: [RedisStreamClientCoreModule],
    };
  }

  public static registerAsync(
    options: RedisStreamModuleAsyncOptions,
  ): DynamicModule {
    return {
      module: RedisStreamClientModule,
      imports: [RedisStreamClientCoreModule.forRootAsync(options)],
      exports: [RedisStreamClientCoreModule],
    };
  }

  public static forRootAsync(
    options: RedisStreamModuleAsyncOptions,
  ): DynamicModule {
    return {
      module: RedisStreamClientModule,
      imports: [RedisStreamClientCoreModule.forRootAsync(options)],
      exports: [RedisStreamClientCoreModule],
    };
  }
}
