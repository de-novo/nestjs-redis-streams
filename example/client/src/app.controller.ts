import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/test/send')
  sendTest() {
    return this.appService.sendTest();
  }

  @Get('/test/emit')
  emitTest() {
    return this.appService.emitTest();
  }
}
