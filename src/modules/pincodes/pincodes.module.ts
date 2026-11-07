import { Module } from '@nestjs/common';
import { PincodesController } from './pincodes.controller.js';
import { PincodesService } from './pincodes.service.js';

@Module({
  controllers: [PincodesController],
  providers: [PincodesService],
  exports: [PincodesService],
})
export class PincodesModule {}
