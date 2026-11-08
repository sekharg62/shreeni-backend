import { Module } from '@nestjs/common';
import { S3ImgUploaderModule } from '../s3-img-uploader/s3-img-uploader.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { PublicProductsController } from './public-products.controller.js';
import { PublicProductsService } from './public-products.service.js';
import { ProductSearchService } from './product-search.service.js';

@Module({
  imports: [S3ImgUploaderModule],
  controllers: [ProductsController, PublicProductsController],
  providers: [ProductsService, PublicProductsService, ProductSearchService],
  exports: [ProductsService],
})
export class ProductsModule {}
