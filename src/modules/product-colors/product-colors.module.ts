import { Module } from '@nestjs/common';
import { ProductColorsController } from './product-colors.controller.js';
import { ProductColorsService } from './product-colors.service.js';

@Module({
  controllers: [ProductColorsController],
  providers: [ProductColorsService],
})
export class ProductColorsModule {}
