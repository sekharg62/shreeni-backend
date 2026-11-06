import { Module } from '@nestjs/common';
import { ProductSpecificationsController } from './product-specifications.controller.js';
import { ProductSpecificationsService } from './product-specifications.service.js';

@Module({
  controllers: [ProductSpecificationsController],
  providers: [ProductSpecificationsService],
})
export class ProductSpecificationsModule {}
