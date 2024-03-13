import { RedisStreamClient } from '@de-novo/nestjs-reids-stream';
import { Injectable } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
@Injectable()
export class AppService {
  constructor(private readonly redisStreamClient: RedisStreamClient) {}

  getHello(): string {
    return 'Hello World!';
  }

  async sendTest() {
    const res = await lastValueFrom(
      this.redisStreamClient.send('test.send', {
        value: { test: 'test' },
        headers: { a: 'a' },
      }),
    );
    return res;
  }

  emitTest() {
    this.redisStreamClient.emit('test.emit', { test: 'test' });

    return 'Emit Test';
  }
}
