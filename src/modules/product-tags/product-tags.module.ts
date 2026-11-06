import { Module } from '@nestjs/common';
import { ProductTagsController } from './product-tags.controller.js';
import { ProductTagsService } from './product-tags.service.js';

@Module({
  controllers: [ProductTagsController],
  providers: [ProductTagsService],
})
export class ProductTagsModule {}
