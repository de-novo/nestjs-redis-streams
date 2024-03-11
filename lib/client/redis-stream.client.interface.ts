import { ModuleMetadata, Type } from '@nestjs/common';
import { ClientConstructorOptions } from '../interface/contructor.options.interface';

export interface RedisStreamClientModuleOptionsFactory {
  createRedisStreamClientModuleOptions():
    | Promise<ClientConstructorOptions>
    | ClientConstructorOptions;
}

export interface RedisStreamModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<RedisStreamClientModuleOptionsFactory>;
  useClass?: Type<RedisStreamClientModuleOptionsFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<ClientConstructorOptions> | ClientConstructorOptions;
  inject?: any[];
}
