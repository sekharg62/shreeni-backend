import { Module } from '@nestjs/common';
import { PincodesModule } from '../pincodes/pincodes.module.js';
import { AddressesController } from './addresses.controller.js';
import { AddressesService } from './addresses.service.js';

@Module({
  imports: [PincodesModule],
  controllers: [AddressesController],
  providers: [AddressesService],
})
export class AddressesModule {}
