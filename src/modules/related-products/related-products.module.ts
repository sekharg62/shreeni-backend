import { Module } from '@nestjs/common';
import { RelatedProductsController } from './related-products.controller.js';
import { RelatedProductsService } from './related-products.service.js';

@Module({
  controllers: [RelatedProductsController],
  providers: [RelatedProductsService],
})
export class RelatedProductsModule {}
