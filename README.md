<p align="center">
  <a href="http://nestjs.com/" target="blank">
    <img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" />
  </a>
</p>

<h3 align="center">
  Redis Streams Transport Strategy for <a href="http://nestjs.com/">NestJS</a> using <a href="https://github.com/luin/ioredis">ioredis</a> library.
</h3>
<div align="center">

![NPM Version](https://img.shields.io/npm/v/%40de-novo%2Fnestjs-redis-stream?color=green)
![NPM Downloads](https://img.shields.io/npm/dt/%40de-novo%2Fnestjs-redis-stream)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues/de-novo/nestjs-redis-stream)

</div>

## Installation

### with npm

```sh
npm i @de-novo/nestjs-redis-streams
```

### with yarn

```sh
yarn add @de-novo/nestjs-redis-streams
```

### with pnpm

```sh
pnpm i @de-novo/nestjs-redis-streams
```

## Why

This open-source project was inspired by the discussions within the NestJS community, specifically Issue [Add more transport strategies (microservices) #3960](https://github.com/nestjs/nest/issues/3960). The issue highlighted the need for expanding the microservices strategies in NestJS, including an interest in various data stream processing methods, with a particular focus on Redis streams. Redis streams are essential for efficiently supporting real-time data processing and messaging requirements in distributed systems.

The primary goal of this project is to facilitate the easy use of Redis streams within NestJS applications. By doing so, we aim to assist developers in implementing real-time data stream processing features more conveniently, thereby enhancing the performance and scalability of applications built on NestJS.

## Run Example

```sh
git clone https://github.com/de-novo/nestjs-redis-stream.git
```

```sh
npm i && npm run build
```

```sh
# redis on
# Docker must be installed.
npm run redis:docker
```

```sh
# client
npm run example:client
```

```sh
# microservice(server)
npm run example:microservice
```

```sh
curl localhost:3000/test/send # use curl
# if you use postman GET: localhost:3000/test/send
```

## Start

### Use Server Side (like Kafka Consumer)

```ts
//  src/main.js
import { RedisStreamServer } from '@de-novo/nestjs-reids-stream';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const redis = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      strategy: new RedisStreamServer({
        connection: {
          path: 'redis://localhost:6379',
        },
        streams: {
          consumer: 'test-1',
          consumerGroup: 'test-group',
          //   deleteMessagesAfterAck: true // not recommend
        },
      }),
    },
  );
  redis.listen();
  await app.listen(3000);
}
bootstrap();
```

```ts
import { Controller } from '@nestjs/common';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @MessagePattern('message')
  sendTest(@Payload() data: any, @Ctx() ctx: any): boolean {
    console.log('data', data, ctx);
    return false;
  }
}
```

### Use Client Side (like Kafka Producer)

```ts
// app.module
import { RedisStreamClientModule } from '@de-novo/nestjs-reids-stream';
import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    RedisStreamClientModule.forRoot({
      connection: {
        path: 'redis://localhost:6379',
      },
      streams: {
        consumer: 'test-1',
        block: 5000,
        consumerGroup: 'test-group',
      },
      responsePattern: ['test.send'],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

```ts
import { RedisStreamClient } from '@de-novo/nestjs-reids-stream';
import { Injectable } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
@Injectable()
export class AppService {
  constructor(private readonly redisStreamClient: RedisStreamClient) {}

  async sendTest() {
    const res = await lastValueFrom(
      this.redisStreamClient.send('test.send', {
        value: { value_test: 'test' }, // @Payload payload => {value_test:'test'}
        headers: { header_test: 'test' }, // @Ctx ctx => {headers:{header_test:"test"}}
      }),
    );
    return res;
  }

  emitTest() {
    this.redisStreamClient.emit('test.emit', { test: 'test' });
    return 'Emit Test';
  }
}
```
