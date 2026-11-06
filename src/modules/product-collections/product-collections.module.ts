import { Module } from '@nestjs/common';
import { ProductCollectionsController } from './product-collections.controller.js';
import { ProductCollectionsService } from './product-collections.service.js';

@Module({
  controllers: [ProductCollectionsController],
  providers: [ProductCollectionsService],
})
export class ProductCollectionsModule {}
