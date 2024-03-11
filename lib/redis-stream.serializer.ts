import { Serializer } from '@nestjs/microservices';
import { RedisStreamContext } from './context/redis-stream.context';

export class RedisStreamRequestSerializer implements Serializer<any, string[]> {
  serialize(value: any, ctx: RedisStreamContext) {
    // console.log('RedisStreamRequestSerializer value', value);
    if (!value.value)
      throw new Error("Could not find the 'data' key in the payload.");
    const headers = ctx.getMessageHeaders();
    const payload = {
      headers,
      value: value.value,
    };
    return this.stringify(payload);
  }
  encode(value: any): string {
    return JSON.stringify(value);
  }

  stringify(value: Record<string, any>): string[] {
    return Object.entries(value)
      .map(([key, value]) => [key, this.encode(value)])
      .flat();
  }
}
