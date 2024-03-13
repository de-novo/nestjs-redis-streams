import { Deserializer } from '@nestjs/microservices';
import { RedisStreamContext } from '../context/redis-stream.context';

/**
 * @publicApi
 */
export class RedisStreamResponseDeserializer implements Deserializer<any, any> {
  deserialize(message: any, ctx: RedisStreamContext) {
    const parsed = this.parseRawMessage(message);
    const headers = this.decode(parsed.headers);
    ctx.setMessageHeaders(headers);
    const decoded = this.decode(parsed.value);
    return decoded;
  }

  decode(value: string): any {
    return JSON.parse(value);
  }

  parseRawMessage(rawMessage: any): any {
    const [, payload] = rawMessage;

    const obj = (payload as any[]).reduce((acc, cur, idx, arr) => {
      if (idx % 2 === 0) {
        acc[cur] = arr[idx + 1];
      }
      return acc;
    }, {});

    return obj;
  }
}
