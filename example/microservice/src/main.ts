import { RedisStreamServer } from '@de-novo/nestjs-redis-streams';
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
        },
      }),
    },
  );
  redis.listen();
  await app.listen(3001);
}
bootstrap();
