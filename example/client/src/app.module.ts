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
        consumer: 'api-1',
        block: 5000,
        consumerGroup: 'api',
        deleteMessagesAfterAck: true,
      },
      responsePattern: ['test.send'],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
