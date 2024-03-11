import { DynamicModule, Module } from '@nestjs/common';
import { ClientConstructorOptions } from '../interface/contructor.options.interface';
import { RedisStreamClientCoreModule } from './redis-stream.client.core.module';
import { RedisStreamModuleAsyncOptions } from './redis-stream.client.interface';

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
