import { Module } from '@nestjs/common';
import { ColorsController } from './colors.controller.js';
import { ColorsService } from './colors.service.js';

@Module({
  controllers: [ColorsController],
  providers: [ColorsService],
  exports: [ColorsService],
})
export class ColorsModule {}
