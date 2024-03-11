import { Controller } from '@nestjs/common';
import { Ctx, MessagePattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @MessagePattern('test.send')
  sendTest(@Payload() data: any, @Ctx() ctx: any): boolean {
    console.log('data', data, ctx);
    return false;
  }

  @MessagePattern('test.emit')
  emitTest() {}
}
