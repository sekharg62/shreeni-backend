import { Module } from '@nestjs/common';
import { S3ImgUploaderModule } from '../s3-img-uploader/s3-img-uploader.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [S3ImgUploaderModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
